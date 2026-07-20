// Dependency-free integration checks for the endless-run systems. Run with
// `npm run verify`; failures throw and produce a non-zero exit.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ROLES, type Role } from '../audio/kits';
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
import { AIM_RANGE, ALL_ENEMY_KINDS, ENEMY_LABELS, MULTISHOT_FAN_RAD, RUN, SHOVE_S, STAGE_MAGNET, TIER_LINES, WEAPON_SHOVE, WEAPONS, type EnemyKind } from './config';
import { rollOffers } from './picks';
import { mulberry32 } from './rng';
import { KIT_COLORS, RunWorld, type FxEvent, type Projectile, type RunEvents, type Shockwave, type Zone } from './run';
import {
  ARP,
  BASS,
  CHORD,
  HAT,
  KICK,
  SNARE,
  WEAPON_MODULES,
  weaponTiers,
  type ShockwaveSpec,
  type WeaponContext,
  type WeaponInstance,
  type WeaponTarget,
  type ZoneSpec,
} from './weapons';
import type { WeaponConf } from './config';
import { TIER_COUNT } from '../audio/charts';
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
assert.equal(mods.extraPierce, 5);
assert.equal(mods.bounceCount, 3);
assert.equal(mods.damageMul, 1.25);
assert.equal(mods.maxHpBonus, 40);
assert.equal(mods.armorBonus, 2);
assert.equal(mods.hpRegenPerSecond, 0.5);
// Double Take stops at two levels, so the all-items-at-5 sweep clamps to 2.
assert.equal(mods.extraProjectiles, 2);

// Needle Tips is pierce-only (#145), so every one of its levels has to move
// pierce — there is no damage rider left for a flat level to pay for. The old
// [0,1,1,2,2,3] ladder would leave levels 2 and 4 doing literally nothing.
for (let level = 1; level <= itemMaxLevel('needleTips'); level++) {
  const at = (n: number) => deriveBuildMods(new Map<ItemId, number>([['needleTips', n]])).extraPierce;
  assert.equal(at(level) - at(level - 1), 1,
    `Needle Tips level ${level} must grant +1 pierce; a pierce-only item cannot have a no-op level`);
}

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
const hatDamageLadder = weaponTiers('hat')!.map(({ damage }) => damage);
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
  evolutionWorld.fireTrigger({ role, time: 0, velocity: 1, step: 0 });
}
evolutionWorld.update(1 / 60);
const evolvedOutputCount = evolutionWorld.projectiles.length + evolutionWorld.zones.length +
  evolutionWorld.shockwaves.length + evolutionWorld.gravityWells.length + (evolutionWorld.fx?.length ?? 0);
assert(evolvedOutputCount > evolutionRoles.length,
  'evolved triggers should create their expanded gameplay and visual patterns');

// Variants and velocity are sound-only (docs/adr/0001): what a chart event says
// about the sound — which sample, how loud — must never cross into the world.
// Two identically built worlds, one fed the quietest plain triggers and one fed
// the loudest with a variant named on every trigger, have to produce the same
// gameplay down to the number: same damage, same footprint, same enemies left
// standing. ('pad' and 'fat' are the two variants that used to move the world;
// naming one on every role is deliberately more than any real chart would do.)
function soundOnlyOutput(expression: 'loud' | 'quiet', evolved: boolean): string {
  const probe = new RunWorld({ width: 1280, height: 720 }, events, {
    scripted: false,
    fx: false,
    rng: () => 0.5,
  });
  probe.invincible = true;
  for (const role of evolutionRoles) probe.addWeapon(role, 4);
  if (evolved) {
    for (const [item] of allItems) probe.addItem(item, 5);
    for (const role of evolutionRoles) assert(probe.evolve(role));
  }
  // Dead ahead of the player and inside the base clap's 108-unit tier-IV reach,
  // so every weapon — including the short cone — has the same thing to hit in
  // both worlds. spawnEnemyAt places a sprite-feet position and offsets the
  // circle center off it, so pin the center afterwards the way the hi-hat check
  // does. Absurd HP makes it a damage meter: a target that dies in both worlds
  // hides exactly the difference this check exists to catch.
  const target = probe.spawnEnemyAt('tank', probe.player.x + 90, probe.player.y)!;
  target.x = probe.player.x + 90;
  target.y = probe.player.y;
  target.hp = 1e6;
  // Populate the spatial hash at the pinned position: the cone and blast
  // weapons query it, and an unbuilt hash makes them all silently miss.
  probe.update(0);
  for (const role of evolutionRoles) {
    probe.fireTrigger(expression === 'loud'
      ? { role, time: 0, velocity: 1, step: 0, variant: role === 'bass' ? 'fat' : 'pad' }
      : { role, time: 0, velocity: 0.05, step: 0 });
  }
  // Spawn-time damage and footprint: what velocity and the variants used to bend.
  const spawned = [
    probe.projectiles.map((p) => [p.role, p.damage, p.radius, p.lifeS, p.x, p.y, p.vx, p.vy]),
    probe.zones.map((z) => [z.damage, z.radius, z.lifeS]),
    probe.shockwaves.map((s) => [s.damage, s.maxRadius, s.lifeS]),
  ];
  // Then let it play out, so the delayed hits (the clap cone, Two Hands' crush)
  // land and show up as damage actually dealt.
  for (let i = 0; i < 30; i++) probe.update(1 / 60);
  return JSON.stringify([spawned, probe.enemies.map((e) => e.hp)]);
}

// NOTE ON WHAT THIS CAN AND CANNOT CATCH. Both operands are produced by the
// same code at the same commit, so this is a SELF-COMPARISON: it proves the two
// runs agree with each other, never that either agrees with yesterday. Any
// drift that moves loud and quiet equally — a halved damage tier, a shrunken
// footprint — cancels out and this stays green. It is also built with
// rng: () => 0.5, so it cannot see rng draw-order change at all.
//
// That is not a flaw; it is the exact shape ADR-0001 needs, and it should stay
// this way. It just is not a regression net. The regression net is the recorded
// golden baseline in weapon-parity-check.ts, which compares against a digest
// captured at a known-good commit and counts rng draws. The two are
// complementary and neither substitutes for the other.
for (const evolved of [false, true]) {
  assert.equal(soundOnlyOutput('loud', evolved), soundOnlyOutput('quiet', evolved),
    `velocity and variant must not change ${evolved ? 'evolved' : 'base'} damage or footprint`);
}

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
// player-centred blast the way Subquake (a 288-unit ring) is meant to be.
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

// ---- weapon modules (#139) ----
//
// Roster invariants: cheap, and they catch a re-added shadow copy of a ladder
// that the module is supposed to be the only owner of.
for (const m of WEAPON_MODULES) {
  assert.equal(m.stats.tiers.length, TIER_COUNT, `${m.role} needs one stat block per tier`);
  assert.equal(m.stats.tierLines.length, TIER_COUNT, `${m.role} needs one pedestal line per tier`);
}
assert.equal(WEAPONS.kick, undefined, 'the kick module is the only copy of the kick ladder');
assert.equal(TIER_LINES.kick, undefined, 'the kick module is the only copy of the kick pedestal copy');
assert.equal(WEAPONS.arp, undefined, 'the arp module is the only copy of the arp ladder');
assert.equal(TIER_LINES.arp, undefined, 'the arp module is the only copy of the arp pedestal copy');
assert.equal(new Set(WEAPON_MODULES.map((m) => m.role)).size, WEAPON_MODULES.length,
  'one module per weapon');

// A weapon context small enough to hand-build. This is the falsifier for the
// whole seam: if the fake cannot be written this small, the context leaked the
// world. Its rng() THROWS, which turns "the kick draws nothing from the run
// stream" into an executable assertion rather than a comment.
interface FakeTarget extends WeaponTarget {
  x: number;
  y: number;
  radius: number;
  dead: boolean;
  speed: number;
  knockbackMul: number;
  lastMoveX: number;
  lastMoveY: number;
  /** Fake-side bookkeeping; the real world sink owns hp. */
  hp: number;
  /** Fake-side mirror of the world's shared SLOW channel. The real fields live
   *  on Enemy and are consumed by moveEnemies; they are reproduced here so the
   *  chord's `min()` fold and its plain timer refresh are both observable —
   *  ctx.slow() is write-only across the seam, so a log alone could not show
   *  that two overlapping zones leave the HARSHER multiplier in place. */
  slowT: number;
  zoneSlowMul: number;
}

function fakeTarget(x: number, y: number, over: Partial<FakeTarget> = {}): FakeTarget {
  return {
    x, y, radius: 12, dead: false, speed: 60, knockbackMul: 1,
    lastMoveX: 0, lastMoveY: 0, hp: 1e6, slowT: 0, zoneSlowMul: 1, ...over,
  };
}

class FakeCtx implements WeaponContext {
  role: Role = 'kick';
  color = KIT_COLORS.kick;
  evolved = false;
  timeS = 0;
  player = { x: 0, y: 0, facingX: 1 as 1 | -1 };
  worldW = 1422;
  worldH = 800;
  buildMods = deriveBuildMods(new Map());
  readonly targets: FakeTarget[] = [];
  readonly fxLog: FxEvent[] = [];
  readonly hits: Array<{ t: FakeTarget; amount: number }> = [];
  readonly knocks: string[] = [];
  /** Interleaved effect order: the base strip pushes its whip BEFORE damage,
   *  Redline Stomp pushes its beams AFTER. Both orderings are pinned. */
  readonly seq: string[] = [];

  /** Values this weapon is allowed to draw, in order. NULL means "this weapon
   *  must draw nothing", which is what makes the kick's zero-draw contract an
   *  executable assertion rather than a comment. The arp draws exactly once per
   *  trigger, so its checks hand it a script. */
  rngValues: number[] | null = null;
  rngDraws = 0;
  rng(): number {
    if (this.rngValues === null) throw new Error(`${this.role} must draw nothing from the run stream`);
    const next = this.rngValues.shift();
    assert(next !== undefined, `${this.role} drew more rng values than the check supplied`);
    this.rngDraws += 1;
    return next;
  }
  /** Triggers served so far. RunWorld increments its per-role counter BEFORE
   *  calling fire(), so a check that wants "the fourth trigger" bumps this the
   *  same way — see snareCtx.fire(). */
  triggerCount = 0;
  /** The world's auto-aim, reproduced from RunWorld.aimDir/aimFan side by side
   *  with them. Faithful in the one respect that matters most: the DRAW COUNT.
   *  One draw with a target in AIM_RANGE, TWO with an empty screen, exactly one
   *  aimDir per aimFan however many directions come back. */
  aimDir(spread: number): { x: number; y: number } {
    let best: FakeTarget | null = null;
    let bestD = AIM_RANGE * AIM_RANGE;
    for (const t of this.targets) {
      if (t.dead) continue;
      const d = (t.x - this.player.x) ** 2 + (t.y - this.player.y) ** 2;
      if (d < bestD) { bestD = d; best = t; }
    }
    let ang = best
      ? Math.atan2(best.y - this.player.y, best.x - this.player.x)
      : this.rng() * Math.PI * 2;
    ang += (this.rng() * 2 - 1) * spread;
    return { x: Math.cos(ang), y: Math.sin(ang) };
  }
  aimFan(spread: number): Array<{ x: number; y: number }> {
    return this.fanAround(this.aimDir(spread));
  }
  /** The persisted walk heading. Initialised to (1, 0) the way RunWorld
   *  initialises the player, and only ever overwritten by a check that means
   *  to — which is exactly how standing still keeps the last heading. */
  moveDirX = 1;
  moveDirY = 0;
  moveDir(): { x: number; y: number } {
    return { x: this.moveDirX, y: this.moveDirY };
  }
  fanAround(base: { x: number; y: number }): Array<{ x: number; y: number }> {
    const count = 1 + this.buildMods.extraProjectiles;
    if (count <= 1) return [base];
    const baseAngle = Math.atan2(base.y, base.x);
    const dirs: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < count; i++) {
      const ang = baseAngle + Math.ceil(i / 2) * (i % 2 === 1 ? 1 : -1) * MULTISHOT_FAN_RAD;
      dirs.push({ x: Math.cos(ang), y: Math.sin(ang) });
    }
    return dirs;
  }
  near(x: number, y: number, r: number): readonly WeaponTarget[] {
    return this.targets.filter((t) => Math.hypot(t.x - x, t.y - y) <= r + t.radius);
  }
  /** RunWorld.nearestEnemy, reproduced side by side with it: ARRAY order,
   *  SQUARED distances, a STRICT `<` against `range * range`, and NO RNG DRAW.
   *  The draw count is the point — the chord's whole zero-draw contract is that
   *  this is not aimDir(0). */
  nearestEnemy(range: number): WeaponTarget | null {
    let best: FakeTarget | null = null;
    let bestD = range * range;
    for (const t of this.targets) {
      if (t.dead) continue;
      const d = (t.x - this.player.x) ** 2 + (t.y - this.player.y) ** 2;
      if (d < bestD) { bestD = d; best = t; }
    }
    return best;
  }
  all(): readonly WeaponTarget[] { return this.targets; }
  damage(t: WeaponTarget, amount: number): void {
    const f = t as FakeTarget;
    this.hits.push({ t: f, amount });
    this.seq.push('damage');
    f.hp -= amount;
    if (f.hp <= 0) f.dead = true;
  }
  /** Every shove with its target and origin. `knocks` above records only the
   *  distance and is asserted verbatim by the kick's checks, so the snare's
   *  rails — which care WHICH body got pushed and from WHERE — get their own
   *  log rather than widening that string. */
  readonly shoveLog: Array<{ t: FakeTarget; x: number; y: number; d: number }> = [];
  shove(t: WeaponTarget, x: number, y: number, d: number): void {
    this.knocks.push(`shove:${d}`);
    this.shoveLog.push({ t: t as FakeTarget, x, y, d });
  }
  setKnock(_t: WeaponTarget, vx: number, vy: number, s: number): void {
    this.knocks.push(`knock:${vx},${vy},${s}`);
  }
  /** Every slow, with its target. The write itself is reproduced from
   *  RunWorld.makeWeaponContext exactly: the multiplier folds in with min(),
   *  the timer is ASSIGNED. Getting that asymmetry backwards here would hide
   *  the mid-evolve check's whole point. */
  readonly slowLog: Array<{ t: FakeTarget; mul: number; durationS: number }> = [];
  slow(t: WeaponTarget, mul: number, durationS: number): void {
    const f = t as FakeTarget;
    this.slowLog.push({ t: f, mul, durationS });
    f.slowT = durationS;
    f.zoneSlowMul = Math.min(f.zoneSlowMul, mul);
  }
  fx(e: FxEvent): void { this.fxLog.push(e); this.seq.push(e.type); }
  /** Projectiles this fake world is holding. Mirrors RunWorld.projectiles
   *  closely enough for the arp: append on spawn, splice by identity on
   *  retire, array order is spawn order. */
  readonly spawned: Projectile[] = [];
  spawnProjectile(conf: WeaponConf, damage: number): Projectile {
    // The defaulting RunWorld.baseProjectile does, kept side by side with it.
    const pr: Projectile = {
      role: this.role, x: this.player.x, y: this.player.y, vx: 0, vy: 0,
      radius: conf.radius!, damage, pierce: conf.pierce ?? 1, maxPierce: conf.pierce ?? 1,
      lifeS: conf.lifetimeS!, homing: false, speed: conf.speed ?? 0, color: this.color,
      hit: new Set(), age: 0, orbitAngle: 0, orbitRadius: 0, rehitT: 0, homingRange: Infinity,
      shatter: 0, shard: false, bounces: this.buildMods.bounceCount,
      bounceRetention: this.buildMods.bounceRetention, evolved: this.evolved,
      turnRate: 10, orbitDir: 1, gravity: false,
    };
    this.spawned.push(pr);
    this.seq.push('spawn');
    return pr;
  }
  projectiles(): readonly Projectile[] {
    return this.spawned.filter((pr) => pr.role === this.role);
  }
  retireProjectile(pr: Projectile): void {
    const index = this.spawned.indexOf(pr);
    if (index >= 0) this.spawned.splice(index, 1);
  }
  /** Shockwaves this fake world is holding. Mirrors RunWorld's array for the
   *  bass: append on spawn, splice by identity on retire, array order is spawn
   *  order — and, exactly like the real one, NOTHING here grows or resolves a
   *  ring. That is entirely the module's tick(). */
  readonly rings: Shockwave[] = [];
  spawnShockwave(spec: ShockwaveSpec): Shockwave {
    // The defaulting RunWorld.makeWeaponContext does, kept side by side with
    // it: the module supplies geometry and payload, the world supplies identity
    // and bookkeeping.
    const wave: Shockwave = {
      x: spec.x, y: spec.y, radius: spec.radius, maxRadius: spec.maxRadius,
      age: 0, lifeS: spec.lifeS, damage: spec.damage, shove: spec.shove,
      color: this.color, source: this.role, hit: new Set(),
    };
    this.rings.push(wave);
    this.seq.push('shockwave');
    return wave;
  }
  shockwaves(): readonly Shockwave[] {
    return this.rings.filter((wave) => wave.source === this.role);
  }
  retireShockwave(wave: Shockwave): void {
    const index = this.rings.indexOf(wave);
    if (index >= 0) this.rings.splice(index, 1);
  }
  /** Zones this fake world is holding. Mirrors RunWorld's array for the chord:
   *  append on spawn, splice by identity on retire, array order is spawn order
   *  — and, exactly like the real one, NOTHING here ticks, drifts, merges or
   *  expires a zone. That is entirely the module's tick(). */
  readonly fields: Zone[] = [];
  spawnZone(spec: ZoneSpec): Zone {
    // The defaulting RunWorld.makeWeaponContext does, kept side by side with
    // it: the module supplies geometry, payload and character, the world
    // supplies identity and the one piece of bookkeeping — tickT at ZERO.
    const zone: Zone = {
      x: spec.x, y: spec.y, radius: spec.radius, damage: spec.damage,
      lifeS: spec.lifeS, tickT: 0, color: this.color, source: this.role,
      slow: spec.slow, evolved: spec.evolved, driftSpeed: spec.driftSpeed,
      damageCap: spec.damageCap, slowMul: spec.slowMul,
    };
    this.fields.push(zone);
    this.seq.push('zone');
    return zone;
  }
  zones(): readonly Zone[] {
    return this.fields.filter((zone) => zone.source === this.role);
  }
  retireZone(zone: Zone): void {
    const index = this.fields.indexOf(zone);
    if (index >= 0) this.fields.splice(index, 1);
  }
  /** Advance every live orbiter one frame through the module's own steer hook,
   *  the way RunWorld.updateProjectiles does. */
  steer(inst: WeaponInstance, n: number): void {
    for (let i = 0; i < n; i++) {
      this.timeS += 1 / 60;
      for (const pr of this.spawned) {
        pr.age += 1 / 60;
        pr.lifeS -= 1 / 60;
        inst.projectile!.steer!(this, pr, 1 / 60);
      }
    }
  }
  step(inst: WeaponInstance, n: number): void {
    for (let i = 0; i < n; i++) { this.timeS += 1 / 60; inst.tick!(this, 1 / 60); }
  }
  whips(): Array<Extract<FxEvent, { type: 'whip' }>> {
    return this.fxLog.filter((e): e is Extract<FxEvent, { type: 'whip' }> => e.type === 'whip');
  }
}

const kickTiers = KICK.stats.tiers;

// ---------------------------------------------------------------------------
// The kick's tuning, pinned to LITERALS.
//
// #139 moved these numbers out of run.ts and promised "values unchanged". A
// promise is only worth something if something can catch it being broken, and
// the checks below this block cannot: they assert module output AGAINST the
// stats block (`kickTiers[3].damage * KICK.stats.evolvedDamageMul`), so both
// sides of the assertion move together and any edit to a stat is self-
// consistent. Halving the damage ladder used to leave every one of them green.
//
// So: literals. The right-hand side of each assertion below is a number a human
// typed after reading the pre-#139 run.ts, not an expression that reads the
// value it is checking. That is the entire point — a later refactor cannot
// quietly move one of these and still pass.
//
// These are BALANCE numbers. If one legitimately changes, this block is
// supposed to fail, and updating it is how the change gets reviewed.
// ---------------------------------------------------------------------------
{
  // WORLD_SCALE (800 / 456) is irrational-looking enough that the products are
  // pinned rounded, with the authored H800 figure shown in the comment.
  const round6 = (n: number): number => Math.round(n * 1e6) / 1e6;

  // The per-tier damage ladder. Mapped from Whip levels 1, 3, 5 and 8.
  assert.deepEqual(
    kickTiers.map((t) => [t.damage, t.area, t.amount]),
    [
      [3, 1, 1],
      [5, 1, 2],
      [9, 1.1, 2],
      [15, 1.2, 2],
    ],
    'the kick damage/area/amount ladder moved',
  );
  assert.equal(kickTiers.length, TIER_COUNT, 'the kick ladder must have exactly TIER_COUNT rungs');

  // Strip geometry, in H800 world units.
  assert.equal(round6(KICK.stats.stripBaseWidth), 149.122807, 'stripBaseWidth moved (85 * WORLD_SCALE)');
  assert.equal(round6(KICK.stats.stripBaseHeight), 38.596491, 'stripBaseHeight moved (22 * WORLD_SCALE)');
  assert.equal(KICK.stats.growS, 0.1, 'the strip grow ramp moved');
  assert.equal(KICK.stats.liveS, 0.2, 'the strip lifetime moved');
  assert.equal(KICK.stats.followUpDelayS, 0.1, 'the follow-up gap moved');
  assert.equal(KICK.stats.queryPad, 48, 'the hash query pad moved');

  // Redline Stomp.
  assert.equal(KICK.stats.evolvedDamageMul, 1.35, 'Redline Stomp damage multiplier moved');
  assert.equal(KICK.stats.evolvedReachFrac, 0.58, 'Redline Stomp arm length moved');
  assert.equal(KICK.stats.evolvedHalfFrac, 0.75, 'Redline Stomp arm thickness moved');
  assert.equal(KICK.stats.evolvedShove, 18, 'Redline Stomp push distance moved');

  // Identity, not tuning, but equally load-bearing: tickAt is the phase name
  // the world's tick call site has to match.
  assert.equal(KICK.tickAt, 'strikes', 'the kick ticks in the strikes phase');
  assert.equal(KICK.role, 'kick');
}

// 1. The base strip defers ENTIRELY: no damage and no fx at fire time.
{
  const ctx = new FakeCtx();
  const inst = KICK.create();
  ctx.targets.push(fakeTarget(120, 0));
  inst.fire(ctx, kickTiers[0]);
  assert.equal(ctx.hits.length, 0, 'the base kick deals no damage at fire time');
  assert.equal(ctx.fxLog.length, 0, 'the base kick pushes no fx at fire time');
}

// 2. The whip fx precedes the strip's damage, and 3. a target ON the player is
// hit on the very first tick, when the strip has grown to zero reach and the
// rect has degenerated to the anchor point.
{
  const ctx = new FakeCtx();
  const inst = KICK.create();
  const pointBlank = fakeTarget(0, 0);
  ctx.targets.push(pointBlank);
  inst.fire(ctx, kickTiers[0]);
  ctx.step(inst, 1);
  assert.deepEqual(ctx.seq, ['whip', 'damage'],
    'the base strip pushes its whip before it deals damage');
  const whip = ctx.whips()[0];
  assert.equal(whip.side, 1);
  assert.equal(whip.area, 1);
  assert.equal(whip.color, KIT_COLORS.kick);
  assert.equal(ctx.hits.length, 1,
    'a zero-size strip on its start frame still lands a point-blank hit');
}

// 4. One hit per strike across exactly twelve damage passes, and no damage on
// the expiry frame.
{
  const ctx = new FakeCtx();
  const inst = KICK.create();
  ctx.targets.push(fakeTarget(60, 0));
  inst.fire(ctx, kickTiers[0]);
  ctx.step(inst, 12);
  assert.equal(ctx.hits.length, 1, 'a strike hits each target once, not once per frame');
  ctx.step(inst, 1);
  assert.equal(ctx.hits.length, 1, 'the expiry frame runs no damage pass');
  assert.equal(KICK.stats.liveS / (1 / 60), 12, 'a strike lives for exactly twelve damage passes');
}

// 5. The follow-up resamples LIVE player state at start: its side is the
// inverse of the facing AT THAT MOMENT, not the inverse of its parent, so
// turning around inside the gap puts both strips on the same side. It still
// inherits the parent's frozen damage and area.
{
  const ctx = new FakeCtx();
  const inst = KICK.create();
  inst.fire(ctx, kickTiers[1]);
  ctx.step(inst, 1);
  ctx.player = { x: 300, y: 50, facingX: -1 };
  ctx.step(inst, 6);
  const whips = ctx.whips();
  assert.equal(whips.length, 2, 'tier 2 schedules exactly one follow-up strip');
  assert.equal(whips[1].x, 300, 'the follow-up samples the CURRENT player position');
  assert.equal(whips[1].y, 50);
  assert.equal(whips[0].side, 1);
  assert.equal(whips[1].side, 1,
    'turning around inside the gap puts the follow-up on the same side as its parent');
  assert.equal(whips[1].area, whips[0].area, 'the follow-up inherits its parent frozen area');
}

// 6. spawnFollowUp is a BOOLEAN, not a count: amount 3 still yields one follow-up.
{
  const ctx = new FakeCtx();
  const inst = KICK.create();
  inst.fire(ctx, { damage: 5, area: 1, amount: 3 });
  ctx.step(inst, 30);
  assert.equal(ctx.whips().length, 2, 'amount above 2 must not grow a loop of follow-ups');
}

// 7. The two knock branches are deliberately asymmetric and must not be unified.
{
  const moving = new FakeCtx();
  const movingInst = KICK.create();
  moving.targets.push(fakeTarget(60, 0, { lastMoveX: 5, lastMoveY: 3 }));
  movingInst.fire(moving, kickTiers[0]);
  // Six ticks: the strip grows from zero reach, so a target at 60 units is
  // only inside it once bodyScale has ramped. Per-strike dedup keeps this to
  // exactly one knock however long it runs.
  moving.step(movingInst, 6);
  assert.deepEqual(moving.knocks, [`knock:-5,-3,${SHOVE_S}`],
    'a moving target has its pursuit reversed, with the duration ASSIGNED');

  const still = new FakeCtx();
  const stillInst = KICK.create();
  still.targets.push(fakeTarget(60, 0));
  stillInst.fire(still, kickTiers[0]);
  still.step(stillInst, 6);
  assert.deepEqual(still.knocks, [`shove:${60 * SHOVE_S}`],
    'a target that did not move last frame — every practice dummy — takes the shove fallback');

  const immune = new FakeCtx();
  const immuneInst = KICK.create();
  immune.targets.push(fakeTarget(60, 0, { knockbackMul: 0, lastMoveX: 5 }));
  immuneInst.fire(immune, kickTiers[0]);
  immune.step(immuneInst, 6);
  assert.deepEqual(immune.knocks, [], 'a knockback-immune target takes neither branch');
}

// 8. Redline Stomp resolves SYNCHRONOUSLY at fire time, and pushes its four
// beams AFTER its damage — the opposite ordering from the base strip.
{
  const ctx = new FakeCtx();
  const inst = KICK.create();
  ctx.evolved = true;
  const onArm = fakeTarget(700, 0);
  const corner = fakeTarget(ctx.worldW * 0.45, ctx.worldH * 0.45);
  ctx.targets.push(onArm, corner);
  inst.fire(ctx, kickTiers[3]);
  assert.equal(ctx.hits.length, 1, 'Redline Stomp damages on the trigger, with no tick');
  assert.equal(ctx.hits[0].t, onArm);
  // A LITERAL, deliberately: `kickTiers[3].damage * KICK.stats.evolvedDamageMul`
  // would move with the very stats this is meant to hold still. 15 * 1.35.
  assert.equal(ctx.hits[0].amount, 20.25);
  assert.deepEqual(ctx.seq, ['damage', 'beam', 'beam', 'beam', 'beam'],
    'Redline Stomp pushes every beam after its damage');
  const beams = ctx.fxLog.filter((e): e is Extract<FxEvent, { type: 'beam' }> => e.type === 'beam');
  const reachX = ctx.worldW * KICK.stats.evolvedReachFrac;
  const reachY = ctx.worldH * KICK.stats.evolvedReachFrac;
  assert.deepEqual(beams.map((b) => [b.x2, b.y2]),
    [[reachX, 0], [-reachX, 0], [0, reachY], [0, -reachY]],
    'the four arms are emitted +X, -X, +Y, -Y');
  // A still target — the shape every practice dummy has — is NOT skipped.
  assert.equal(onArm.lastMoveX, 0);
}

// 9. The evolved shove reads the build; the base strip's deliberately does not.
{
  const ctx = new FakeCtx();
  const inst = KICK.create();
  ctx.evolved = true;
  ctx.buildMods = { ...deriveBuildMods(new Map()), knockbackMul: 2 };
  ctx.targets.push(fakeTarget(700, 0));
  inst.fire(ctx, kickTiers[3]);
  assert.deepEqual(ctx.knocks, [`shove:${KICK.stats.evolvedShove * 2}`],
    'Redline Stomp scales its push by buildMods.knockbackMul');
}

// 10. reset() drops every scheduled strip, so clearSandboxEntities keeps its
// promise that no delayed strike pointer survives.
{
  const ctx = new FakeCtx();
  const inst = KICK.create();
  ctx.targets.push(fakeTarget(60, 0));
  inst.fire(ctx, kickTiers[1]);
  inst.reset();
  ctx.step(inst, 20);
  assert.equal(ctx.hits.length, 0, 'a reset weapon lands no delayed damage');
  assert.equal(ctx.fxLog.length, 0, 'a reset weapon pushes no delayed fx');
}

// ---------------------------------------------------------------------------
// THE ARP (#140, #144).
//
// The arp is the migration's stress test: its behavior did not live in its own
// functions, it lived INSIDE RunWorld's shared projectile loop as three
// `pr.role === 'arp'` branches. Those are now ProjectileBehavior.steer and
// .onHit on the module, so the checks below drive them the way the shared loop
// does — spawn through the context, then step steer() a frame at a time.
// ---------------------------------------------------------------------------

const arpTiers = ARP.stats.tiers;
/** Same rounding the kick block uses, hoisted: several arp checks compare
 *  products of the stats they are pinning. */
const round6 = (n: number): number => Math.round(n * 1e6) / 1e6;

// ---------------------------------------------------------------------------
// The arp's tuning, pinned to LITERALS. Same rule as the kick block above: the
// right-hand sides are numbers a human typed after reading the pre-#140 run.ts
// and config.ts, never an expression that reads the value it is checking.
// ---------------------------------------------------------------------------
{
  // The per-tier ladder, verbatim from config.WEAPONS.arp. A geometry ladder as
  // much as a damage one: the orbit widens 80 -> 92 -> 106 -> 122.
  assert.deepEqual(
    arpTiers.map((t) => [t.damage, t.radius, t.lifetimeS, t.orbitRadius]),
    [
      [2, 8, 2.0, 80],
      [2, 8, 2.4, 92],
      [2, 9, 2.8, 106],
      [3, 10, 3.2, 122],
    ],
    'the arp damage/size/lifetime/orbit ladder moved',
  );
  assert.equal(arpTiers.length, TIER_COUNT, 'the arp ladder must have exactly TIER_COUNT rungs');

  // #144: the timer re-hit, as named stats. These two numbers were ORBIT_REHIT_S
  // in config.ts and a bare 0.45 sitting in two places in run.ts. They are the
  // arp's identity (ADR-0002) and they are BALANCE numbers: chipping every
  // 0.35s instead of every 0.5s is a different weapon.
  assert.equal(ARP.stats.rehitS, 0.35, 'the base orbiter re-hit interval moved (was ORBIT_REHIT_S)');
  assert.equal(ARP.stats.evolvedRehitS, 0.45, 'the Event Horizon re-hit interval moved');
  assert.equal(ARP.stats.spendsPierce, false,
    'an orbiter must never spend pierce — it chips on a timer instead (ADR-0002)');

  assert.equal(ARP.stats.omega, 3.4, 'the orbit sweep speed moved (was ARP_OMEGA)');

  // Event Horizon.
  assert.equal(ARP.stats.evolvedOrbitRadius, 125, 'the Event Horizon orbit radius moved');
  assert.equal(ARP.stats.evolvedOrbitBreath, 25, 'the Event Horizon breath amplitude moved');
  assert.equal(ARP.stats.evolvedBreathRate, 3.2, 'the Event Horizon breath rate moved');
  assert.equal(ARP.stats.evolvedRadiusMul, 1.25, 'the Event Horizon orbiter size moved');
  assert.equal(ARP.stats.evolvedLifetimeMul, 1.35, 'the Event Horizon orbiter lifetime moved');
  assert.equal(ARP.stats.evolvedDamageMul, 0.8, 'the Event Horizon per-orbiter damage moved');
  assert.equal(ARP.stats.evolvedRadiusFallback, 8, 'the Event Horizon radius fallback moved');
  assert.equal(ARP.stats.evolvedLifetimeFallbackS, 2, 'the Event Horizon lifetime fallback moved');
  // Was an inline `while (evolvedOrbiters.length > 24)` in run.ts.
  assert.equal(ARP.stats.evolvedOrbiterCap, 24, 'the Event Horizon orbiter cap moved');

  // Read through the roster, not off ARP: `satisfies WeaponModule` narrows the
  // literal, so ARP.tickAt is not even a property to compare.
  const arpModule = WEAPON_MODULES.find((m) => m.role === 'arp')!;
  assert.equal(arpModule.tickAt, undefined,
    'the arp owns no damage pass: its orbiters ride the shared projectile loop');
  assert(arpModule.create().projectile,
    'the arp lends the shared projectile loop its motion through ProjectileBehavior');
  assert.equal(ARP.role, 'arp');
  // The breath must never reach the player and never leave the swept band, or
  // "orbits you" quietly becomes "a zone centered on you".
  assert(ARP.stats.evolvedOrbitBreath < ARP.stats.evolvedOrbitRadius,
    'the Event Horizon breath must never collapse the orbit onto the player');
  assert.equal(round6(ARP.stats.evolvedOrbitRadius - ARP.stats.evolvedOrbitBreath), 100);
  assert.equal(round6(ARP.stats.evolvedOrbitRadius + ARP.stats.evolvedOrbitBreath), 150);
}

/** A fake context set up for the arp, with a scripted rng. */
function arpCtx(rngValues: number[], evolved = false): FakeCtx {
  const ctx = new FakeCtx();
  ctx.role = 'arp';
  ctx.color = KIT_COLORS.arp;
  ctx.evolved = evolved;
  ctx.rngValues = rngValues;
  return ctx;
}

// A1. One trigger draws EXACTLY ONE rng value and puts one orbiter on the ring.
// The draw count is the thing: the arp's single base-angle draw per trigger, no
// matter how many orbiters that trigger makes, is the easiest thing in this
// whole extraction to get wrong and the hardest to notice.
{
  const ctx = arpCtx([0.25]);
  const inst = ARP.create();
  inst.fire(ctx, arpTiers[3]);
  assert.equal(ctx.rngDraws, 1, 'one arp trigger draws exactly one rng value');
  assert.equal(ctx.spawned.length, 1, 'one trigger, one orbiter');
  const pr = ctx.spawned[0];
  // 0.25 * 2pi = pi/2, so the orbiter starts straight above the player at the
  // tier-4 orbit radius of 122.
  assert.equal(round6(pr.orbitAngle), round6(Math.PI / 2));
  assert.equal(pr.orbitRadius, 122, 'the orbiter sits on the tier orbit radius');
  assert.equal(round6(Math.hypot(pr.x - ctx.player.x, pr.y - ctx.player.y)), 122);
  assert.equal(pr.pierce, Infinity, 'an orbiter spawns with infinite pierce (ADR-0002)');
  assert.equal(pr.rehitT, 0, 'a base orbiter arms its re-hit timer on its first step');
  assert.equal(pr.damage, 3, 'a tier-4 orbiter carries the pedestal damage');
  assert.equal(pr.evolved, false);
  assert.equal(ctx.hits.length, 0, 'the arp deals no damage at fire time');
}

// A2. ORBIT MOTION. steer() returns TRUE — "I positioned this one myself" — and
// that single return value is what keeps the shared travel step and the arena
// rails off an orbiter. The angle advances by omega, the radius never does.
{
  const ctx = arpCtx([0]);
  const inst = ARP.create();
  inst.fire(ctx, arpTiers[3]);
  const pr = ctx.spawned[0];
  assert.equal(inst.projectile!.steer!(ctx, pr, 1 / 60), true,
    'an orbiter steers itself, which is what exempts it from travel and the arena rails');
  // 3.4 rad/s at 1/60 s. A LITERAL: reading ARP.stats.omega here would move
  // with the very stat this is holding still.
  assert.equal(round6(pr.orbitAngle), round6(3.4 / 60));
  assert.equal(round6(pr.x), round6(Math.cos(3.4 / 60) * 122));
  assert.equal(round6(pr.y), round6(Math.sin(3.4 / 60) * 122));

  // A full sweep: the distance from the player is constant, so an orbiter never
  // reaches inside its own orbit and never leaves it. That is the whole
  // difference between "orbits you" and "a zone centered on you".
  ctx.steer(inst, 120);
  assert.equal(round6(Math.hypot(pr.x - ctx.player.x, pr.y - ctx.player.y)), 122,
    'the orbit radius never changes for a base orbiter');
  // 121 frames of 3.4 rad/s is more than a full revolution (2pi = 6.28 rad).
  assert(pr.orbitAngle > Math.PI * 2, 'the orbiter completes a revolution in its lifetime');
}

// A3. The orbit is bound to the PLAYER, not to the arena. Moving the player
// re-centers every orbiter on the next step, which is the underlying reason
// ADR-0002 exempts orbiters from the arena rails.
{
  const ctx = arpCtx([0]);
  const inst = ARP.create();
  inst.fire(ctx, arpTiers[0]);
  const pr = ctx.spawned[0];
  ctx.player = { x: 500, y: -300, facingX: 1 };
  ctx.steer(inst, 1);
  assert.equal(round6(Math.hypot(pr.x - 500, pr.y - -300)), 80,
    'an orbiter follows the player it orbits');
}

// A4. THE TIMER RE-HIT (#144, ADR-0002). The hit set is what stops a projectile
// touching the same enemy twice; an orbiter empties it on a clock instead of
// dying, so a slow sweep keeps chipping. 0.35s at 1/60 is 21 frames.
{
  const ctx = arpCtx([0]);
  const inst = ARP.create();
  inst.fire(ctx, arpTiers[3]);
  const pr = ctx.spawned[0];
  // The first step arms the timer (a base orbiter spawns with rehitT 0).
  ctx.steer(inst, 1);
  assert.equal(round6(pr.rehitT), 0.35, 'the base re-hit timer arms at 0.35s');
  (pr.hit as Set<unknown>).add({});
  ctx.steer(inst, 20);
  assert.equal(pr.hit.size, 1, 'the same enemy is off-limits until the re-hit timer expires');
  ctx.steer(inst, 2);
  assert.equal(pr.hit.size, 0, 'after 0.35s the orbiter may chip the same enemy again');
  assert.equal(round6(pr.rehitT), 0.35, 're-arming uses the same 0.35s interval, every time');
}

// A5. THE PIERCE EXEMPTION, ported AS-IS (#138 resolved as intended, ADR-0002).
// onHit() returning false is the whole exemption: the shared loop skips its
// `pr.pierce -= 1` and the orbiter survives its own sweep.
{
  const ctx = arpCtx([0]);
  const inst = ARP.create();
  inst.fire(ctx, arpTiers[3]);
  const pr = ctx.spawned[0];
  assert.equal(inst.projectile!.onHit!(ctx, pr, fakeTarget(0, 0)), false,
    'an orbiter never spends pierce on a hit — it gates re-hits by time instead');
  // Ten hits in a row, and it is still whole.
  for (let i = 0; i < 10; i++) {
    assert.equal(inst.projectile!.onHit!(ctx, pr, fakeTarget(i, 0)), false);
  }
  assert.equal(pr.pierce, Infinity, 'nothing in the hit path may consume an orbiter');
}

// A6. EVENT HORIZON: counter-rotating pairs, one draw, its own re-hit interval.
{
  const ctx = arpCtx([0], true);
  const inst = ARP.create();
  inst.fire(ctx, arpTiers[3]);
  assert.equal(ctx.rngDraws, 1, 'one Event Horizon trigger draws exactly one rng value');
  assert.equal(ctx.spawned.length, 2, 'Event Horizon spawns a counter-rotating PAIR per trigger');
  const [cw, ccw] = ctx.spawned;
  assert.deepEqual([cw.orbitDir, ccw.orbitDir], [1, -1], 'the pair counter-rotates');
  assert.equal(round6(Math.abs(cw.orbitAngle - ccw.orbitAngle)), round6(Math.PI),
    'the pair starts on opposite sides of the orbit');
  // LITERALS: 3 * 0.8, 10 * 1.25, 3.2 * 1.35.
  assert.equal(round6(cw.damage), 2.4, 'an Event Horizon orbiter trades punch for count');
  assert.equal(round6(cw.radius), 12.5);
  assert.equal(round6(cw.lifeS), 4.32);
  assert.equal(cw.pierce, Infinity);
  assert.equal(cw.evolved, true);
  assert.equal(cw.rehitT, 0.45, 'Event Horizon arms its own 0.45s re-hit interval at spawn');
}

// A7. The evolved orbit BREATHES: it ignores the tier orbitRadius and sweeps
// between 100 and 150 on the orbiter's own age. A fixed-radius evolved orbit
// would pass every other check in this file.
{
  const ctx = arpCtx([0], true);
  const inst = ARP.create();
  inst.fire(ctx, arpTiers[3]);
  const pr = ctx.spawned[0];
  const radii: number[] = [];
  for (let i = 0; i < 120; i++) {
    ctx.steer(inst, 1);
    radii.push(Math.hypot(pr.x - ctx.player.x, pr.y - ctx.player.y));
  }
  const min = Math.min(...radii);
  const max = Math.max(...radii);
  assert(min >= 100 - 1e-9 && max <= 150 + 1e-9,
    'the Event Horizon orbit stays inside 100..150');
  assert(max - min > 45, 'the Event Horizon orbit must actually breathe, not sit at a radius');
  assert(min < 122, 'the breath reaches inside the tier-4 orbit it replaces');
}

// A8. THE ORBITER CAP. Event Horizon retires its OLDEST evolved orbiters down
// to 24 whenever a trigger pushes it over. Two per trigger, so trigger 13 is
// the first one that has to retire anything.
{
  const ctx = arpCtx(Array.from({ length: 20 }, (_, i) => i / 20), true);
  const inst = ARP.create();
  inst.fire(ctx, arpTiers[3]);
  const firstPair = [...ctx.spawned];
  for (let i = 1; i < 20; i++) inst.fire(ctx, arpTiers[3]);
  assert.equal(ctx.spawned.length, 24,
    'twenty triggers make forty orbiters; the cap holds the live count at 24');
  for (const old of firstPair) {
    assert(!ctx.spawned.includes(old), 'the cap retires the OLDEST orbiters, not the newest');
  }
  // Twelve triggers is exactly the cap, so nothing is retired at the boundary.
  const under = arpCtx(Array.from({ length: 12 }, (_, i) => i / 12), true);
  const underInst = ARP.create();
  for (let i = 0; i < 12; i++) underInst.fire(under, arpTiers[3]);
  assert.equal(under.spawned.length, 24, 'exactly at the cap, nothing is retired');
}

// A9. reset() has nothing to drop — every orbiter lives in the world's own
// projectile array, which clearSandboxEntities empties. Pinned so that stays
// true: a future arp that schedules something owes this check a body.
{
  const ctx = arpCtx([0]);
  const inst = ARP.create();
  inst.fire(ctx, arpTiers[0]);
  inst.reset();
  assert.equal(ctx.hits.length, 0, 'a reset arp lands no delayed damage');
  assert.equal(ctx.fxLog.length, 0, 'the arp pushes no fx at all');
}

const snareTiers = SNARE.stats.tiers;

// ---------------------------------------------------------------------------
// The snare's tuning, pinned to LITERALS. Same rule as the kick and arp blocks
// above: the right-hand sides are numbers a human typed after reading the
// pre-#141 run.ts and config.ts, never an expression that reads the value it is
// checking.
// ---------------------------------------------------------------------------
{
  // The per-tier ladder, verbatim from config.WEAPONS.snare. A PIERCE ladder as
  // much as a damage one: 2 -> 3 -> 4 -> 6 bodies per shot.
  assert.deepEqual(
    snareTiers.map((t) => [t.damage, t.speed, t.radius, t.lifetimeS, t.pierce]),
    [
      [5, 650, 7, 1.4, 2],
      [7, 650, 7, 1.4, 3],
      [9, 680, 8, 1.5, 4],
      [13, 720, 8, 1.5, 6],
    ],
    'the snare damage/speed/size/lifetime/pierce ladder moved',
  );
  assert.equal(snareTiers.length, TIER_COUNT, 'the snare ladder must have exactly TIER_COUNT rungs');
  assert.deepEqual(SNARE.stats.tierLines, [
    'piercing shot on the backbeat',
    'fires twice as often, pierces 1 more',
    'adds weak ghost shots, pierces 1 more',
    'burst of shots every 4th bar',
  ], 'the snare pedestal copy moved');

  // The base shot.
  assert.equal(SNARE.stats.aimSpread, 0.08, 'the base snare aim jitter moved');
  // WAS WEAPON_SHOVE.snare, a role-keyed table entry read inside the shared
  // projectile loop. It is the snare's own tuning and this is now its only copy.
  assert.equal(SNARE.stats.shove, 8, 'the base snare knock distance moved (was WEAPON_SHOVE.snare)');
  // WAS the snare's membership of run.ts's SPARK_HIT_ROLES plus the two
  // literals at the push site inside the shared loop.
  assert.equal(SNARE.stats.sparkCount, 4, 'the snare hit-spark particle count moved');
  assert.equal(SNARE.stats.sparkSpread, 12, 'the snare hit-spark spread moved');

  // Railshot.
  assert.equal(SNARE.stats.railAimSpread, 0.02, 'the Railshot aim jitter moved');
  assert.equal(SNARE.stats.railRange, 900, 'the Railshot reach moved');
  assert.equal(SNARE.stats.railDamageMul, 1.5, 'the Railshot damage multiplier moved');
  assert.equal(SNARE.stats.railWidthMul, 1.25, 'the Railshot beam width multiplier moved');
  assert.equal(SNARE.stats.railShove, 16, 'the Railshot knock distance moved');
  assert.equal(SNARE.stats.railBeamWidthMul, 2, 'the drawn Railshot beam width moved');
  // The two literals inside the old `Math.max(7, (conf.radius ?? 7) * 1.25)`.
  // NEITHER IS REACHABLE by any legal build — every shipped rung sets radius,
  // and the smallest rung times the multiplier is 8.75, already clear of the
  // floor at the minimum legal areaMul of 1. They are pinned here BECAUSE no
  // behavioral check can reach them; ported verbatim rather than dropped.
  assert.equal(SNARE.stats.railWidthFloor, 7, 'the (unreachable) Railshot width floor moved');
  assert.equal(SNARE.stats.railRadiusFallback, 7, 'the (unreachable) Railshot radius fallback moved');
  assert(
    Math.min(...snareTiers.map((t) => t.radius!)) * SNARE.stats.railWidthMul > SNARE.stats.railWidthFloor,
    'the Railshot width floor is documented as unreachable; if a ladder rung ever drops under it ' +
    'the floor becomes live behavior and needs a real check, not a literal pin',
  );

  // The twin rails.
  assert.equal(SNARE.stats.twinCadence, 4, 'the Railshot twin-rail cadence moved');
  assert.equal(SNARE.stats.twinOffset, 24, 'the twin rail offset moved');
  assert.equal(SNARE.stats.twinWidthMul, 0.7, 'the twin rail width moved');
  assert.equal(SNARE.stats.twinDamageMul, 0.65, 'the twin rail damage moved');
  assert.equal(SNARE.stats.twinShove, 8, 'the twin rail knock distance moved');
  assert.equal(SNARE.stats.twinBeamWidthMul, 1, 'the drawn twin beam width moved');

  assert.equal(WEAPONS.snare, undefined, 'the snare module is the only copy of the snare ladder');
  assert.equal(TIER_LINES.snare, undefined, 'the snare module is the only copy of the snare pedestal copy');
  // The role-keyed tables the snare used to share. Its entry left with it; the
  // OTHER entries must not have left with it, because those weapons have not
  // moved and their shove still comes off this table inside the shared loop.
  assert.equal(WEAPON_SHOVE.snare, undefined,
    'the snare\'s share of WEAPON_SHOVE moved into SNARE_STATS.shove');
  assert.deepEqual(WEAPON_SHOVE, { clap: 12 },
    'WEAPON_SHOVE keeps the entries of the weapons that have NOT migrated (the bass\'s 6 left ' +
    'with the bass module in #141; clap is the last one and takes the table with it)');

  const snareModule = WEAPON_MODULES.find((m) => m.role === 'snare')!;
  assert.equal(snareModule.tickAt, undefined,
    'the snare owns no damage pass: base shots ride the shared projectile loop and Railshot ' +
    'resolves inside fire()');
  const behavior = snareModule.create().projectile;
  assert(behavior, 'the snare lends the shared projectile loop its hit rule');
  assert.equal(behavior.steer, undefined,
    'a snare shot rides SHARED travel and the arena rails unchanged — implementing steer() would ' +
    'silently take it off both, which is the half of ProjectileBehavior this weapon must not have');
  assert.equal(SNARE.role, 'snare');
}

/** A fake context set up for the snare, with a scripted rng. */
function snareCtx(rngValues: number[], evolved = false): FakeCtx {
  const ctx = new FakeCtx();
  ctx.role = 'snare';
  ctx.color = KIT_COLORS.snare;
  ctx.evolved = evolved;
  ctx.rngValues = rngValues;
  return ctx;
}

/** Fire the way RunWorld.fireTrigger does: the world's per-role trigger counter
 *  is bumped in the shared preamble BEFORE fire() runs, which is what makes the
 *  FOURTH trigger the one where `% 4 === 0`. Getting this backwards moves the
 *  twin rails onto the fifth trigger and nothing else changes. */
function snareFire(ctx: FakeCtx, inst: WeaponInstance, conf: WeaponConf): void {
  ctx.triggerCount += 1;
  inst.fire(ctx, conf);
}

const sparks = (ctx: FakeCtx): Array<Extract<FxEvent, { type: 'spark' }>> =>
  ctx.fxLog.filter((e): e is Extract<FxEvent, { type: 'spark' }> => e.type === 'spark');
const beams = (ctx: FakeCtx): Array<Extract<FxEvent, { type: 'beam' }>> =>
  ctx.fxLog.filter((e): e is Extract<FxEvent, { type: 'beam' }> => e.type === 'beam');

// S1. ONE TRIGGER, ONE SHOT, ONE DRAW. The base snare spawns a plain projectile
// and deals no damage at fire time; the aim costs exactly one rng value when
// there is something to aim at.
{
  const ctx = snareCtx([0.5]);
  const inst = SNARE.create();
  ctx.targets.push(fakeTarget(300, 0));
  snareFire(ctx, inst, snareTiers[3]);
  assert.equal(ctx.rngDraws, 1, 'one snare trigger with a target in range draws exactly one rng value');
  assert.equal(ctx.spawned.length, 1, 'one trigger, one shot');
  assert.equal(ctx.hits.length, 0, 'the base snare deals no damage at fire time');
  assert.equal(ctx.fxLog.length, 0, 'the base snare pushes no fx at fire time');
  const pr = ctx.spawned[0];
  // LITERALS, from the tier-4 rung: 13 damage, 6 pierce, 720 speed.
  assert.equal(pr.damage, 13, 'a tier-4 shot carries the pedestal damage');
  assert.equal(pr.pierce, 6, 'a tier-4 shot carries the pedestal pierce budget');
  assert.equal(pr.maxPierce, 6);
  assert.equal(pr.speed, 720);
  // rng 0.5 means zero jitter, and the only target sits due east.
  assert.equal(round6(pr.vx), 720, 'velocity is derived from pr.speed along the aim line');
  assert.equal(round6(pr.vy), 0);
  assert.equal(round6(Math.hypot(pr.vx, pr.vy)), 720,
    'the speed FIELD must stay equal to |v| — the bounce path reads it');
}

// S2. THE EMPTY-SCREEN DRAW. With nothing to aim at, the world picks a random
// heading and THEN jitters it: two draws, not one. Only the draw count sees
// this, and getting it wrong desynchronises the whole run's rng stream.
{
  const ctx = snareCtx([0, 0.5]);
  const inst = SNARE.create();
  snareFire(ctx, inst, snareTiers[0]);
  assert.equal(ctx.rngDraws, 2, 'an empty screen costs the snare TWO draws, not one');
  assert.equal(ctx.spawned.length, 1, 'an empty screen still fires the shot');
}

// S3. DOUBLE TAKE fans extra shots off ONE aim. Three shots, still one draw.
{
  const ctx = snareCtx([0.5]);
  const inst = SNARE.create();
  ctx.buildMods = { ...ctx.buildMods, extraProjectiles: 2 };
  ctx.targets.push(fakeTarget(300, 0));
  snareFire(ctx, inst, snareTiers[0]);
  assert.equal(ctx.rngDraws, 1, 'Double Take fans off a SINGLE aim: one draw however many shots');
  assert.equal(ctx.spawned.length, 3, 'two extra projectiles means three shots');
  const angles = ctx.spawned.map((pr) => Math.atan2(pr.vy, pr.vx));
  assert.equal(round6(angles[0]), 0, 'the first shot rides the aim line itself');
  assert.equal(round6(angles[1] + angles[2]), 0, 'the extras straddle the aim line symmetrically');
}

// S4. THE HIT RULE. This is where the snare's share of BOTH role-keyed tables
// landed: the shove that was WEAPON_SHOVE.snare and the spark that was
// SPARK_HIT_ROLES. onHit returns TRUE, so a snare shot spends pierce like every
// other projectile — its ladder IS a pierce ladder.
{
  const ctx = snareCtx([0.5]);
  const inst = SNARE.create();
  ctx.targets.push(fakeTarget(300, 0));
  snareFire(ctx, inst, snareTiers[3]);
  const pr = ctx.spawned[0];
  pr.x = 250;
  pr.y = 10;
  const target = ctx.targets[0];
  assert.equal(inst.projectile!.onHit!(ctx, pr, target), true,
    'a snare shot spends pierce on a hit — only the arp is exempt (ADR-0002)');
  // A LITERAL 8: the number that used to be WEAPON_SHOVE.snare.
  assert.deepEqual(ctx.shoveLog.map((s) => [s.x, s.y, s.d]), [[250, 10, 8]],
    'the hit shove pushes away from the SHOT, at the snare\'s own knock distance');
  assert.deepEqual(sparks(ctx).map((s) => [s.x, s.y, s.n, s.spread, s.color]),
    [[300, 0, 4, 12, KIT_COLORS.snare]],
    'the hit spark lands on the TARGET, with the count and spread the shared loop used to push');
}

// S5. The shove is scaled by the build, and a build that cancels knockback
// cancels the shove entirely rather than calling it with zero — the `if (sh)`
// the shared loop had, ported verbatim.
{
  const scaled = snareCtx([0.5]);
  scaled.buildMods = { ...scaled.buildMods, knockbackMul: 2 };
  const scaledInst = SNARE.create();
  scaled.targets.push(fakeTarget(300, 0));
  snareFire(scaled, scaledInst, snareTiers[0]);
  scaledInst.projectile!.onHit!(scaled, scaled.spawned[0], scaled.targets[0]);
  assert.deepEqual(scaled.shoveLog.map((s) => s.d), [16], 'the build scales the hit shove');

  const none = snareCtx([0.5]);
  none.buildMods = { ...none.buildMods, knockbackMul: 0 };
  const noneInst = SNARE.create();
  none.targets.push(fakeTarget(300, 0));
  snareFire(none, noneInst, snareTiers[0]);
  noneInst.projectile!.onHit!(none, none.spawned[0], none.targets[0]);
  assert.deepEqual(none.shoveLog, [], 'a zeroed knockback build shoves not at all');
  assert.equal(sparks(none).length, 1, 'the spark is view-only and does not depend on the shove');
}

// S6. RAILSHOT IS INSTANT AND ITS PIERCE IS GENUINELY INFINITE.
//
// Not "a big number": there is no pierce budget in the rail path at all, which
// is why this check is a fifteen-deep file rather than an assertion about a
// stat. A rail that ever grew a budget — even Infinity fed through arithmetic —
// would still pass a stat check and fail here the moment the budget was finite.
{
  const ctx = snareCtx([0.5], true);
  const inst = SNARE.create();
  const file = Array.from({ length: 15 }, (_, i) => fakeTarget(40 + i * 40, 0));
  ctx.targets.push(...file);
  snareFire(ctx, inst, snareTiers[3]);
  assert.equal(ctx.spawned.length, 0, 'Railshot spawns no projectile — it resolves inside the trigger');
  assert.equal(ctx.hits.length, 15, 'a rail drills the WHOLE file; it has no pierce budget to spend');
  // LITERAL: tier-4 damage 13 * 1.50.
  for (const hit of ctx.hits) assert.equal(round6(hit.amount), 19.5, 'every body in the file takes full rail damage');
  assert.deepEqual(ctx.shoveLog.map((s) => s.d), Array(15).fill(16), 'every body in the file is shoved');
  assert.equal(sparks(ctx).length, 0, 'Railshot pushes beams, not per-hit sparks');
  // LITERALS: reach 900, drawn width 2 * max(7, 8 * 1.25) = 20.
  assert.deepEqual(beams(ctx).map((b) => [b.x, b.y, round6(b.x2), round6(b.y2), b.width]),
    [[0, 0, 900, 0, 20]], 'one rail, drawn along its whole 900 reach');
}

// S7. THE RAIL CORRIDOR. Reach and half-width are both measured against the
// body's own radius, so a body is caught if it OVERLAPS the corridor.
{
  const ctx = snareCtx([0.5], true);
  const inst = SNARE.create();
  // The aim anchor must be the CLOSEST body, or the rail points somewhere else.
  const anchor = fakeTarget(5, 0);              // in range, and the aim anchor
  const justInside = fakeTarget(910, 0);        // 910 <= 900 + 12
  const justOutside = fakeTarget(913, 0);       // 913 >  900 + 12
  const behind = fakeTarget(-13, 0);            // -13 < -12, behind the player
  const wide = fakeTarget(400, 23);             // 23 > 10 + 12, outside the band
  const edge = fakeTarget(400, 21);             // 21 <= 10 + 12, inside it
  ctx.targets.push(anchor, justInside, justOutside, behind, wide, edge);
  snareFire(ctx, inst, snareTiers[3]);
  assert.deepEqual(ctx.hits.map((h) => h.t), [anchor, justInside, edge],
    'the rail catches exactly the bodies overlapping its 900-long, 10-half-wide corridor');
}

// S8. DAMAGE ORDER IS THE FIELD'S ARRAY ORDER — spawn order — not distance
// order and not hash order. Every rng draw a kill triggers rides on this, so it
// is behavior. `ctx.all()` is the matching primitive; `ctx.near()` is not.
{
  const ctx = snareCtx([0.5], true);
  const inst = SNARE.create();
  const far = fakeTarget(600, 0);
  const near = fakeTarget(80, 0);
  const mid = fakeTarget(300, 0);
  ctx.targets.push(far, near, mid);
  snareFire(ctx, inst, snareTiers[0]);
  assert.deepEqual(ctx.hits.map((h) => h.t), [far, near, mid],
    'a rail damages in the order the field was spawned in, NOT nearest-first');
}

// S9. THE TWIN CADENCE. Every fourth trigger fires a pair of rails either side
// of the main one. The world bumps its trigger counter BEFORE fire(), so it is
// trigger 4 — not 5 — and triggers 1-3 draw a single beam.
{
  const ctx = snareCtx([0.5, 0.5, 0.5, 0.5], true);
  const inst = SNARE.create();
  // Radius 20, deliberately: a twin sits 24 off the axis with a half-width of
  // 7, so a body has to be fat enough to reach it. A default radius-12 body on
  // the axis is missed by both twins, and this check would then pin nothing
  // about them.
  ctx.targets.push(fakeTarget(300, 0, { radius: 20 }));
  for (let i = 0; i < 3; i++) {
    ctx.fxLog.length = 0;
    snareFire(ctx, inst, snareTiers[3]);
    assert.equal(beams(ctx).length, 1, `trigger ${i + 1} fires a single rail`);
  }
  ctx.fxLog.length = 0;
  ctx.hits.length = 0;
  ctx.shoveLog.length = 0;
  snareFire(ctx, inst, snareTiers[3]);
  const twinBeams = beams(ctx);
  assert.equal(twinBeams.length, 3, 'the fourth trigger fires the main rail plus TWIN rails');
  // LITERALS: offset 24 either side of the aim line, main drawn at 20 wide and
  // a twin at 10 — the twin is drawn NARROWER than the corridor it damages
  // (half-width 7 means a 14-wide band). That mismatch is ported verbatim.
  assert.deepEqual(twinBeams.map((b) => [round6(b.x), round6(b.y), b.width]),
    [[0, 0, 20], [0, -24, 10], [0, 24, 10]],
    'main rail first, then the twin at -1, then the twin at +1');
  // Damage: the axis body is hit by all three rails. LITERALS: 13 * 1.5 and
  // 13 * 1.5 * 0.65.
  assert.deepEqual(ctx.hits.map((h) => round6(h.amount)), [19.5, 12.675, 12.675],
    'a body on the axis takes the main rail and both twins');
}

// S10. TWIN SHOVE ORDER IS LOAD-BEARING. ctx.shove ASSIGNS the knock vector
// rather than max()ing it, so on a twin trigger the LAST rail to touch a body
// wins: a body on the axis ends up carrying the TWIN's smaller knock, not the
// main rail's. Batching the damage or reordering the rails moves this.
{
  const ctx = snareCtx([0.5, 0.5, 0.5, 0.5], true);
  const inst = SNARE.create();
  ctx.targets.push(fakeTarget(300, 0, { radius: 20 }));
  for (let i = 0; i < 4; i++) snareFire(ctx, inst, snareTiers[3]);
  // LITERALS: 16 for the main rail, 8 for each twin.
  assert.deepEqual(ctx.shoveLog.slice(-3).map((s) => [round6(s.y), s.d]),
    [[0, 16], [-24, 8], [24, 8]],
    'main rail, then twin(-1), then twin(+1) — the last one to touch a body sets its knock');
}

// S11. MID-EVOLVE. Base shots already in flight keep the base hit rule; the
// module's onHit does not consult ctx.evolved, exactly as the role-keyed tables
// it replaced did not.
{
  const ctx = snareCtx([0.5, 0.5], false);
  const inst = SNARE.create();
  ctx.targets.push(fakeTarget(300, 0));
  snareFire(ctx, inst, snareTiers[3]);
  const inFlight = ctx.spawned[0];
  ctx.evolved = true;
  ctx.hits.length = 0;
  ctx.shoveLog.length = 0;
  inst.projectile!.onHit!(ctx, inFlight, ctx.targets[0]);
  assert.deepEqual(ctx.shoveLog.map((s) => s.d), [8],
    'a base shot still in flight when the snare evolves keeps the base knock');
}

// S12. reset() has nothing to drop: base shots live in the world's projectile
// array and Railshot leaves nothing behind at all. Pinned so that stays true.
{
  const ctx = snareCtx([0.5], true);
  const inst = SNARE.create();
  ctx.targets.push(fakeTarget(300, 0));
  snareFire(ctx, inst, snareTiers[0]);
  const before = ctx.hits.length;
  inst.reset();
  assert.equal(ctx.hits.length, before, 'a reset snare lands no delayed damage');
}

const hatTiers = HAT.stats.tiers;

// ---------------------------------------------------------------------------
// The hat's tuning, pinned to LITERALS. Same rule as the kick, arp and snare
// blocks above: the right-hand sides are numbers a human typed after reading
// the pre-#141 config.ts and run.ts, never an expression that reads the value
// it is checking.
// ---------------------------------------------------------------------------
{
  // The per-tier ladder, verbatim from config.WEAPONS.hat. Density is the
  // ladder — per-trigger damage barely moves (2/2/2/3) while the chart carries
  // the growth — and the pierce ladder pays for having no auto-aim.
  assert.deepEqual(
    hatTiers.map((t) => [t.damage, t.speed, t.radius, t.lifetimeS, t.pierce]),
    [
      [2, 440, 3, 0.8, 2],
      [2, 450, 3, 0.85, 2],
      [2, 460, 3, 0.9, 3],
      [3, 480, 3, 0.95, 4],
    ],
    'the hat damage/speed/size/lifetime/pierce ladder moved',
  );
  assert.equal(hatTiers.length, TIER_COUNT, 'the hat ladder must have exactly TIER_COUNT rungs');
  assert.deepEqual(HAT.stats.tierLines, [
    'fast chips along your path',
    'twice the chips',
    'denser stream',
    'a wall of chips',
  ], 'the hat pedestal copy moved');

  // Strobe Lane. The three multipliers were `1.30` inline in run.ts's spawner
  // and HAT_LANE.speedMul / HAT_LANE.lifetimeMul in config.ts.
  assert.equal(HAT.stats.laneDamageMul, 1.30, 'the Strobe Lane damage multiplier moved');
  assert.equal(HAT.stats.laneSpeedMul, 1.5, 'the Strobe Lane speed multiplier moved (was HAT_LANE.speedMul)');
  assert.equal(HAT.stats.laneLifetimeMul, 2.0, 'the Strobe Lane lifetime multiplier moved (was HAT_LANE.lifetimeMul)');
  // WAS a bare `Infinity` written onto the shot at the spawn site.
  assert.equal(HAT.stats.lanePierce, Infinity, 'the Strobe Lane pierce moved');
  assert.deepEqual([...HAT.stats.laneStagger], [0, 26, 52, 78],
    'the Strobe Lane spawn stagger moved (was HAT_LANE.stagger)');

  assert.equal(WEAPONS.hat, undefined, 'the hat module is the only copy of the hat ladder');
  assert.equal(TIER_LINES.hat, undefined, 'the hat module is the only copy of the hat pedestal copy');
  // The hat was in NEITHER role-keyed table: a chip lands damage and nothing
  // else. Pinned so that a later tidy-up cannot quietly grant it a knock.
  assert(!('hat' in WEAPON_SHOVE), 'a hat chip has never had a knock, and must not gain one');

  const hatModule = WEAPON_MODULES.find((m) => m.role === 'hat')!;
  assert.equal(hatModule.tickAt, undefined,
    'the hat owns no damage pass: every chip rides the world\'s shared projectile loop');
  assert.equal(hatModule.create().projectile, undefined,
    'a hat chip rides SHARED travel, the arena rails and the shared pierce rule unchanged, and ' +
    'lands damage and nothing else on a hit. Implementing steer() would take the lane off the ' +
    'rails — and Mirrorball is Strobe Lane\'s partner item, so every lane chip bounces');
  assert.equal(HAT.role, 'hat');
}

/** A fake context set up for the hat. Its rng() THROWS by default, which is
 *  what turns "the hat never draws from the run stream" into an executable
 *  assertion: this weapon aims by steering, so a single draw anywhere in fire()
 *  is a desynchronised run. */
function hatCtx(evolved = false): FakeCtx {
  const ctx = new FakeCtx();
  ctx.role = 'hat';
  ctx.color = KIT_COLORS.hat;
  ctx.evolved = evolved;
  return ctx;
}

/** Fire the way RunWorld.fireTrigger does: the world's per-role counter is
 *  bumped in the shared preamble BEFORE fire() runs. The lane's stagger cycles
 *  on that counter, so getting this backwards shifts every chip's spawn offset
 *  by one rung. */
function hatFire(ctx: FakeCtx, inst: WeaponInstance, conf: WeaponConf): void {
  ctx.triggerCount += 1;
  inst.fire(ctx, conf);
}

// H1. ONE TRIGGER, ONE CHIP, ZERO DRAWS. The base hat fires down the walk
// heading and costs nothing from the run stream: FakeCtx.rng() throws.
{
  const ctx = hatCtx();
  const inst = HAT.create();
  hatFire(ctx, inst, hatTiers[3]);
  assert.equal(ctx.rngDraws, 0, 'a hat trigger draws NOTHING — it steers, it does not aim');
  assert.equal(ctx.spawned.length, 1, 'one trigger, one chip');
  assert.equal(ctx.hits.length, 0, 'the hat deals no damage at fire time');
  assert.equal(ctx.fxLog.length, 0, 'the hat pushes no fx at fire time');
  const pr = ctx.spawned[0];
  // LITERALS, from the tier-4 rung: 3 damage, 4 pierce, 480 speed, 0.95s.
  assert.equal(pr.damage, 3, 'a tier-4 chip carries the pedestal damage');
  assert.equal(pr.pierce, 4, 'a tier-4 chip carries the pedestal pierce budget');
  assert.equal(pr.maxPierce, 4);
  assert.equal(pr.speed, 480);
  assert.equal(pr.lifeS, 0.95);
  // The heading a run starts on, never walked: due east, and no jitter at all.
  assert.equal(round6(pr.vx), 480, 'velocity is derived from pr.speed along the walk heading');
  assert.equal(round6(pr.vy), 0);
  assert.equal(round6(Math.hypot(pr.vx, pr.vy)), 480,
    'the speed FIELD must stay equal to |v| — the bounce path reads it');
  assert.equal(pr.x, 0, 'an unevolved chip spawns on the player, with no stagger');
  assert.equal(pr.y, 0);
}

// H2. THE HEADING IS NOT THE TARGET. This is the identity that separates the
// hat from every weapon migrated before it. An enemy sits due north and the
// player walks due south; the chip goes SOUTH. If fire() ever reaches for
// aimDir/aimFan, rng() throws and this check says so by name.
{
  const ctx = hatCtx();
  const inst = HAT.create();
  ctx.targets.push(fakeTarget(0, -200));
  ctx.moveDirX = 0;
  ctx.moveDirY = 1;
  hatFire(ctx, inst, hatTiers[0]);
  const pr = ctx.spawned[0];
  assert.equal(round6(pr.vx), 0, 'the chip ignores the enemy and follows the heading');
  assert.equal(round6(pr.vy), 440, 'due south, at the tier-1 speed');
  assert.equal(ctx.rngDraws, 0, 'aiming would have cost a draw; steering costs none');
}

// H3. STANDING STILL STILL FIRES. movePlayer only overwrites the heading when
// the stick clears its deadzone, so a stopped player keeps the last one. Drop
// that and the heading becomes a zero vector and every chip spawns with zero
// velocity — a silent, total loss of the weapon.
{
  const ctx = hatCtx();
  const inst = HAT.create();
  ctx.moveDirX = -1;
  ctx.moveDirY = 0;
  hatFire(ctx, inst, hatTiers[3]);
  // Two triggers while the heading never changes produce the exact same angle.
  hatFire(ctx, inst, hatTiers[3]);
  assert.deepEqual(ctx.spawned.map((pr) => [round6(pr.vx), round6(pr.vy)]), [[-480, 0], [-480, 0]],
    'a held heading fires the same angle every trigger — no jitter, no drift');
}

// H4. DOUBLE TAKE FANS AROUND THE HEADING, NEVER OFF IT — and still draws
// nothing. The offsets are the shared MULTISHOT_FAN_RAD ladder (0, +1, -1),
// applied to the walk heading rather than to an aim line.
{
  const ctx = hatCtx();
  const inst = HAT.create();
  ctx.buildMods = { ...ctx.buildMods, extraProjectiles: 2 };
  hatFire(ctx, inst, hatTiers[3]);
  assert.equal(ctx.spawned.length, 3, 'Double Take at level 2 makes three chips');
  assert.equal(ctx.rngDraws, 0, 'a fanned volley is still zero draws — the fan is arithmetic');
  const angles = ctx.spawned.map((pr) => round6(Math.atan2(pr.vy, pr.vx)));
  assert.deepEqual(angles, [0, round6(MULTISHOT_FAN_RAD), round6(-MULTISHOT_FAN_RAD)],
    'the extra chips alternate either side of the heading, centred on it');
}

// H5. STROBE LANE: the four multipliers, on one chip, against the tier-4 rung.
// 3 x 1.30 damage, 480 x 1.5 speed, 0.95 x 2.0 life, and pierce written over
// with Infinity.
{
  const ctx = hatCtx(true);
  const inst = HAT.create();
  hatFire(ctx, inst, hatTiers[3]);
  const pr = ctx.spawned[0];
  assert.equal(round6(pr.damage), 3.9, 'a lane chip hits 1.30x the tier damage');
  assert.equal(pr.speed, 720, 'a lane chip travels 1.5x tier speed');
  assert.equal(round6(Math.hypot(pr.vx, pr.vy)), 720,
    'the velocity carries the lane speed, so the speed FIELD still equals |v|');
  assert.equal(round6(pr.lifeS), 1.9, 'a lane chip lives twice as long');
  assert.equal(pr.pierce, Infinity, 'a lane chip rails through the whole file');
  assert.equal(pr.maxPierce, Infinity);
  // 720 x 1.9 = 1368 units of reach, which is why the lane crosses the arena
  // rails as a matter of course rather than as an edge case.
  assert.equal(round6(pr.speed * pr.lifeS), 1368, 'the lane\'s reach is speed x life');
}

// H6. THE STAGGER CYCLES ON THE TRIGGER COUNT, AND THE COUNT DOES NOT RESET ON
// EVOLUTION. Four lane triggers walk the whole [0, 26, 52, 78] ring and wrap.
// The offset is along the heading, so it is a spawn position, not a velocity.
{
  const ctx = hatCtx(true);
  const inst = HAT.create();
  for (let i = 0; i < 5; i++) hatFire(ctx, inst, hatTiers[3]);
  // triggerCount runs 1..5, so the first chip takes stagger[1 % 4] = 26.
  assert.deepEqual(ctx.spawned.map((pr) => round6(pr.x)), [26, 52, 78, 0, 26],
    'successive lane chips are pushed further along the heading, then wrap');
  assert.deepEqual(ctx.spawned.map((pr) => round6(pr.y)), [0, 0, 0, 0, 0],
    'the stagger runs along the heading and nowhere else');
}

// H7. EVOLVING MID-RUN DOES NOT RESTART THE STAGGER RING. One base trigger,
// then evolve: the next chip takes stagger[2] = 52, not the 26 a hat that had
// only ever fired one trigger as a lane would take. The counter is the world's,
// running since the first trigger of the run.
{
  const ctx = hatCtx();
  const inst = HAT.create();
  hatFire(ctx, inst, hatTiers[3]);
  ctx.evolved = true;
  hatFire(ctx, inst, hatTiers[3]);
  assert.equal(round6(ctx.spawned[1].x), 52,
    'the stagger ring keeps counting across the evolution — it is the world\'s trigger counter');
}

// H8. NEEDLE TIPS: a real stacking build on the base hat, a total no-op on the
// lane. `conf` arrives ALREADY BUILT, so the item's +5 pierce is already in it
// (tier-4 4 -> 9); the base chip carries that 9, and the lane overwrites it
// with Infinity.
//
// THAT OVERWRITE LOOKS EXACTLY LIKE THE BUG #146 FIXED on evolved lead, and it
// is not one. Lead wrote a finite 6 over the pipeline's answer, so the item had
// a bigger number it should have reached; there is no number above Infinity for
// the item to reach here. Pinned in both directions so a future "fix" that
// routes lane pierce through the pipeline has to argue with this check.
{
  const built: WeaponConf = { ...hatTiers[3], pierce: hatTiers[3].pierce! + 5 };
  assert.equal(built.pierce, 9, 'Needle Tips at level 5 takes a tier-4 chip to 9 bodies');

  const base = hatCtx();
  hatFire(base, HAT.create(), built);
  assert.equal(base.spawned[0].pierce, 9, 'the base hat spends the pierce the build gave it');
  assert.equal(base.spawned[0].maxPierce, 9);

  const lane = hatCtx(true);
  hatFire(lane, HAT.create(), built);
  assert.equal(lane.spawned[0].pierce, Infinity,
    'Strobe Lane overwrites the built pierce, which makes Needle Tips a no-op on it. Correct ' +
    'here (an infinity is not a floor to add to) and NOT the #146 shape it resembles');
}

// H9. reset() has nothing to drop: every chip lives in the world's projectile
// array, which clearSandboxEntities empties. Pinned so that stays true.
{
  const ctx = hatCtx(true);
  const inst = HAT.create();
  hatFire(ctx, inst, hatTiers[0]);
  inst.reset();
  assert.equal(ctx.hits.length, 0, 'a reset hat lands no delayed damage');
  assert.equal(ctx.fxLog.length, 0, 'the hat pushes no fx at all');
  assert.equal(ctx.rngDraws, 0, 'and it never drew anything to begin with');
}

const bassTiers = BASS.stats.tiers;

// ---------------------------------------------------------------------------
// The bass's tuning, pinned to LITERALS. Same rule as the kick, arp, snare and
// hat blocks above: the right-hand sides are numbers a human typed after
// reading the pre-#141 config.ts and run.ts, never an expression that reads the
// value it is checking.
//
// ONE OF THESE HAS A SPAWN-TIME HALF THAT IS UNREACHABLE FROM WORLD STATE, and
// that is exactly why it is here. `quakeStartRadius` (40) is written onto a new
// ring and then overwritten by the first growth step before anything reads it;
// the baseline agent verified that by mutating run.ts's spawn-time 40 to 44 and
// watching all 110 parity scenarios stay green. The module writes both the
// spawn value and the growth-curve base from this ONE stat, so the stat is
// observable — but the spawn-time write on its own still is not, and check B5
// plus the literal below are its only cover.
// ---------------------------------------------------------------------------
{
  // The per-tier ladder, verbatim from config.WEAPONS.bass. The weight ladder:
  // per-trigger damage climbs harder than any other kit, and pierce is Infinity
  // at every rung — the wave is stopped by its lifetime and by nothing else.
  assert.deepEqual(
    bassTiers.map((t) => [t.damage, t.speed, t.radius, t.lifetimeS, t.pierce]),
    [
      [3, 135, 22, 2.3, Infinity],
      [5, 140, 28, 2.4, Infinity],
      [8, 145, 34, 2.5, Infinity],
      [13, 150, 42, 2.6, Infinity],
    ],
    'the bass damage/speed/size/lifetime/pierce ladder moved',
  );
  assert.equal(bassTiers.length, TIER_COUNT, 'the bass ladder must have exactly TIER_COUNT rungs');
  assert.deepEqual(BASS.stats.tierLines, [
    'slow piercing wave',
    'waves twice as often',
    'heavier, wider waves',
    'massive wave every 4th bar',
  ], 'the bass pedestal copy moved');

  // The base wave.
  assert.equal(BASS.stats.aimSpread, 0.08, 'the bass aim spread moved');
  // WAS `WEAPON_SHOVE.bass`, read by role inside the shared projectile loop.
  assert.equal(BASS.stats.shove, 6, 'the base wave knock moved (was WEAPON_SHOVE.bass)');

  // Subquake. Every one of these was a bare literal in run.ts's spawnSubquake
  // or updateShockwaves.
  assert.equal(BASS.stats.quakeStartRadius, 40, 'the Subquake start radius moved');
  assert.equal(BASS.stats.quakeMaxRadius, 288, 'the Subquake max radius moved');
  assert.equal(BASS.stats.quakeLifeS, 1.2, 'the Subquake lifetime moved');
  assert.equal(BASS.stats.quakeGrowthS, 1.2, 'the Subquake growth duration moved');
  assert.equal(BASS.stats.quakeDamageMul, 1.55, 'the Subquake damage multiplier moved');
  assert.equal(BASS.stats.quakeShove, 14, 'the Subquake knock moved');
  // TWO stats that happen to hold the same number, and they must stay two. A
  // ring dying exactly as it finishes expanding is a coincidence of tuning, not
  // a structural identity; folding them into one would make it one silently.
  assert.equal(BASS.stats.quakeLifeS, BASS.stats.quakeGrowthS,
    'today a Subquake dies as it finishes growing — if that ever stops being true, this line ' +
    'is the one to delete, NOT one of the two stats above');

  // NO PIERCE BUDGET AND NO HIT CAP ANYWHERE. Infinity on both halves of this
  // weapon is the absence of arithmetic, not a number, so the falsifiable form
  // of "there is no cap" is that no stat exists to hold one. A future
  // `quakeMaxHits` would be a real behavior change wearing documentation's
  // clothes (the same argument Railshot's block makes).
  assert.deepEqual(
    Object.keys(BASS.stats).filter((k) => /pierce|cap|max(hits|targets|bodies)/i.test(k)),
    [],
    'Subquake has no pierce budget, no target count and no hit cap — inventing a stat to ' +
    '"state" its infinite pierce would put a finite number on a path that has none',
  );

  assert.equal(WEAPONS.bass, undefined, 'the bass module is the only copy of the bass ladder');
  assert.equal(TIER_LINES.bass, undefined, 'the bass module is the only copy of the bass pedestal copy');
  // The bass's 6 left WEAPON_SHOVE; clap's 12 keeps the table alive.
  assert.deepEqual(Object.keys(WEAPON_SHOVE), ['clap'],
    'the bass knock is BASS_STATS.shove now, applied from the module\'s own onHit. Clap is the ' +
    'last entry in WEAPON_SHOVE, and takes the table and its INTERIM_EXCEPTIONS entry with it');
  assert.equal(WEAPON_SHOVE.clap, 12, 'clap\'s own tuning is untouched by the bass leaving');

  const bassModule = WEAPON_MODULES.find((m) => m.role === 'bass')!;
  assert.equal(bassModule.tickAt, 'shockwaves',
    'the bass owns the shockwave pass, in the phase RunWorld.updateShockwaves used to stand in ' +
    '— after the shared projectile loop and the zones, before the gravity wells');
  assert.equal(bassModule.create().projectile!.steer, undefined,
    'a base wave rides SHARED travel and the arena rails unchanged. Implementing steer() would ' +
    'exempt it from reflectProjectileFromArena exactly the way the arp is exempted, and only a ' +
    'bouncing wave would ever notice');
  assert.equal(BASS.role, 'bass');
}

/** A fake context set up for the bass. Its rng() THROWS by default: Subquake
 *  aims at nothing and draws nothing, and the module's tick() must not draw
 *  either, so both are executable assertions rather than comments. The base
 *  volley, which does aim, gets an explicit script. */
function bassCtx(evolved = false, rngValues: number[] | null = null): FakeCtx {
  const ctx = new FakeCtx();
  ctx.role = 'bass';
  ctx.color = KIT_COLORS.bass;
  ctx.evolved = evolved;
  ctx.rngValues = rngValues;
  return ctx;
}

// B1. ONE TRIGGER, ONE WAVE, and the tier-4 stat row as LITERALS. A target in
// range means aimDir takes its one-draw branch; 0.5 is the jitter's identity,
// so the wave leaves along the aim line.
{
  const ctx = bassCtx(false, [0.5]);
  const inst = BASS.create();
  ctx.targets.push(fakeTarget(300, 0));
  inst.fire(ctx, bassTiers[3]);
  assert.equal(ctx.rngDraws, 1, 'a base bass trigger costs exactly one draw — the aim jitter');
  assert.equal(ctx.spawned.length, 1, 'one trigger, one wave');
  assert.equal(ctx.rings.length, 0, 'the BASE bass spawns no ring');
  assert.equal(ctx.hits.length, 0, 'the base bass deals no damage at fire time');
  assert.equal(ctx.fxLog.length, 0, 'the base bass pushes no fx at fire time');
  const pr = ctx.spawned[0];
  assert.equal(pr.damage, 13, 'a tier-4 wave carries the pedestal damage');
  assert.equal(pr.speed, 150);
  assert.equal(pr.radius, 42);
  assert.equal(pr.lifeS, 2.6);
  // INFINITE PIERCE, as the literal Infinity and not a large number. The shared
  // rule subtracts one on every hit and never bites.
  assert.equal(pr.pierce, Infinity, 'a wave rolls through everything');
  assert.equal(pr.maxPierce, Infinity);
  assert.equal(round6(pr.vx), 150, 'velocity is derived from pr.speed along the aim line');
  assert.equal(round6(pr.vy), 0);
  assert.equal(round6(Math.hypot(pr.vx, pr.vy)), 150,
    'the speed FIELD must stay equal to |v| — the bounce path reads it');
}

// B2. DOUBLE TAKE FANS FROM ONE AIM. Three waves, still one draw: the "move the
// draw inside the loop" mistake would cost three and desynchronise the run.
{
  const ctx = bassCtx(false, [0.5]);
  const inst = BASS.create();
  ctx.targets.push(fakeTarget(300, 0));
  ctx.buildMods = { ...ctx.buildMods, extraProjectiles: 2 };
  inst.fire(ctx, bassTiers[3]);
  assert.equal(ctx.spawned.length, 3, 'Double Take at level 2 makes three waves');
  assert.equal(ctx.rngDraws, 1, 'one aim per trigger, however many waves come off it');
  const angles = ctx.spawned.map((pr) => round6(Math.atan2(pr.vy, pr.vx)));
  assert.deepEqual(angles, [0, round6(MULTISHOT_FAN_RAD), round6(-MULTISHOT_FAN_RAD)],
    'the extra waves alternate either side of the aim line, centred on it');
}

// B3. THE 6-UNIT KNOCK, FROM ONHIT, AND NOTHING ELSE. This is the bass's share
// of WEAPON_SHOVE, in the slot the table lookup occupied. The shove is measured
// from the WAVE, and the hit pushes NO spark: bass has never been in
// SPARK_HIT_ROLES and must not gain one.
{
  const ctx = bassCtx(false, [0.5]);
  const inst = BASS.create();
  const target = fakeTarget(300, 0);
  ctx.targets.push(target);
  inst.fire(ctx, bassTiers[3]);
  const pr = ctx.spawned[0];
  pr.x = 290;
  pr.y = 4;
  const spends = inst.projectile!.onHit!(ctx, pr, target);
  assert.equal(spends, true,
    'a bass wave spends pierce like every other shot — its ladder just carries Infinity, and ' +
    'Infinity minus one is Infinity. Returning false here would be the arp\'s timer exemption');
  assert.deepEqual(ctx.shoveLog.map((s) => [s.t === target, s.x, s.y, s.d]), [[true, 290, 4, 6]],
    'the knock is 6, away from the wave\'s own position');
  assert.equal(ctx.fxLog.length, 0,
    'a bass hit lands damage and a knock and NOTHING else — no spark, ever');
  assert.equal(ctx.hits.length, 0, 'onHit does not deal the damage; the shared loop already did');
}

// B4. HEAVY AMP SCALES THE BASE KNOCK. buildMods.knockbackMul 1.20 takes the 6
// to 7.2, which is the whole of what the item does to this half of the weapon.
{
  const ctx = bassCtx(false, [0.5]);
  const inst = BASS.create();
  const target = fakeTarget(300, 0);
  ctx.targets.push(target);
  ctx.buildMods = { ...ctx.buildMods, knockbackMul: 1.2 };
  inst.fire(ctx, bassTiers[3]);
  inst.projectile!.onHit!(ctx, ctx.spawned[0], target);
  assert.equal(round6(ctx.shoveLog[0].d), 7.2, 'the base knock scales with buildMods.knockbackMul');
}

// B5. SUBQUAKE: ONE RING, ZERO DRAWS, ZERO FX, ZERO PROJECTILES. rng() throws
// here, so "the evolution aims at nothing" is executable — and the ring's whole
// spawn row is pinned as literals against the tier-4 rung, including the start
// radius that no world-state check can ever see.
{
  const ctx = bassCtx(true);
  const inst = BASS.create();
  ctx.targets.push(fakeTarget(300, 0));
  inst.fire(ctx, bassTiers[3]);
  assert.equal(ctx.rngDraws, 0, 'Subquake does not aim, so it costs nothing from the run stream');
  assert.equal(ctx.spawned.length, 0, 'Subquake spawns no projectile at all');
  assert.equal(ctx.fxLog.length, 0,
    'Subquake pushes NO fx: its entire visual is the view reading world.shockwaves');
  assert.equal(ctx.hits.length, 0, 'the ring deals its damage in tick(), not at fire time');
  assert.equal(ctx.rings.length, 1, 'one trigger, one ring');
  const wave = ctx.rings[0];
  assert.equal(wave.x, 0, 'the ring is anchored at the fire-time player position');
  assert.equal(wave.y, 0);
  assert.equal(wave.radius, 40,
    'the ring is BORN at 40. tick() overwrites this on the first step, so no world-state check ' +
    'can see it and this literal is its only cover');
  assert.equal(wave.maxRadius, 288, 'and grows to 288 at areaMul 1');
  assert.equal(wave.lifeS, 1.2);
  assert.equal(wave.age, 0);
  assert.equal(round6(wave.damage), 20.15, 'tier-4 13 x 1.55');
  assert.equal(wave.shove, 14);
  assert.equal(wave.source, 'bass', 'attribution is the world\'s to fill in, not the module\'s');
  assert.equal(wave.color, KIT_COLORS.bass);
  assert.equal(wave.hit.size, 0);
}

// B6. THE RING READS areaMul AND NEVER READS conf.radius. Those two are easy to
// confuse now that both modes sit behind one stats block, so the conf handed in
// here carries an absurd radius: if the ring ever read it, maxRadius would be
// that number instead of 288 x 1.30.
{
  const ctx = bassCtx(true);
  const inst = BASS.create();
  ctx.buildMods = { ...ctx.buildMods, areaMul: 1.3 };
  inst.fire(ctx, { ...bassTiers[3], radius: 9999 });
  assert.equal(round6(ctx.rings[0].maxRadius), 374.4, 'the ring grows with areaMul (288 x 1.30)');
}

// B7. THE RING'S KNOCK SCALES WITH knockbackMul, and Heavy Amp is Subquake's
// own evolution item, so 14 is never sitting at identity in a real run.
{
  const ctx = bassCtx(true);
  const inst = BASS.create();
  ctx.buildMods = { ...ctx.buildMods, knockbackMul: 1.2 };
  inst.fire(ctx, bassTiers[3]);
  assert.equal(round6(ctx.rings[0].shove), 16.8, 'the ring knock scales with buildMods.knockbackMul');
}

// B8. THE GROWTH CURVE, READ OFF THE RING ITSELF. `40 + (max - 40) * min(1, age
// / 1.2)`: linear from the start radius to the max over the growth duration,
// then CLAMPED. Three readings — a third of the way, the moment it tops out,
// and the clamp — separate the three constants, which one reading could not.
//
// The ring is retired in the same pass it deals its last damage in, which is
// the pin on it living exactly as long as it takes to finish growing.
{
  const ctx = bassCtx(true);
  const inst = BASS.create();
  inst.fire(ctx, bassTiers[3]);
  const wave = ctx.rings[0];
  ctx.step(inst, 24);                                  // age 0.4 = a third
  assert.equal(round6(wave.radius), 122.666667, 'a third of the way: 40 + 248 / 3');
  ctx.step(inst, 48);                                  // age 1.2 exactly
  assert.equal(round6(wave.radius), 288, 'the ring tops out at its max radius');
  assert.equal(ctx.rings.length, 0,
    'and dies in the same pass: the ring lives exactly as long as it takes to expand');
  assert.equal(ctx.rngDraws, 0, 'growing a ring draws nothing');
  assert.equal(ctx.fxLog.length, 0, 'and pushes nothing');
}

// B9. THE RING DOES NOT FOLLOW THE PLAYER. ctx.player is documented as a LIVE
// getter and the kick depends on it being one, which makes reading it from
// tick() the obvious shape — and it is wrong here. The player walks 400 units
// away after the trigger; a ring that had followed him would sweep the body
// parked beside his new position and leave the one beside the old.
{
  const ctx = bassCtx(true);
  const inst = BASS.create();
  // 40 units out: inside the ring's first step (radius 43.44 + a body's 12) and
  // 400 units from where the player ends up. Its twin sits the same 40 units
  // from the DESTINATION, well outside a ring that stayed put — the ring never
  // grows past 288 + 12, so the two can never both be swept.
  const atOrigin = fakeTarget(40, 0);
  const atDestination = fakeTarget(440, 0);
  ctx.targets.push(atOrigin, atDestination);
  inst.fire(ctx, bassTiers[3]);
  ctx.player = { x: 400, y: 0, facingX: 1 };
  ctx.step(inst, 1);
  assert.deepEqual(ctx.hits.map((h) => h.t === atOrigin), [true],
    'the ring stays where it was fired: it swept the body by its ORIGIN, not the one by the ' +
    'player\'s new position');
  assert.equal(round6(ctx.shoveLog[0].x), 0, 'and it shoves away from that anchor');
  assert.equal(round6(ctx.shoveLog[0].y), 0);
}

// B10. ONCE PER BODY, AND NO CAP ON BODIES. The `hit` set is the only thing
// between "the edge crossed you" and "you are inside the ring", and everything
// here is inside it for most of its life. Thirty bodies, one trigger, one hit
// each — a lost hit set is not a subtle regression, it is ~70x the damage, and
// an invented `maxHits` stat fails at whatever number it picked.
{
  const ctx = bassCtx(true);
  const inst = BASS.create();
  for (let i = 0; i < 30; i++) {
    const angle = (Math.PI * 2 * i) / 30;
    ctx.targets.push(fakeTarget(Math.cos(angle) * 100, Math.sin(angle) * 100));
  }
  inst.fire(ctx, bassTiers[3]);
  ctx.step(inst, 72);
  assert.equal(ctx.hits.length, 30, 'every one of the thirty bodies was hit — there is no cap');
  assert.equal(new Set(ctx.hits.map((h) => h.t)).size, 30, 'and each was hit exactly ONCE');
  assert.deepEqual(ctx.hits.map((h) => round6(h.amount)), new Array(30).fill(20.15));
}

// B11. THE RING WALKS ctx.all() IN ARRAY ORDER — spawn order, not distance
// order, which is what an expanding ring looks like it should have and is not.
// Every rng draw a kill triggers lands in this order, so it is behavior. The
// three bodies below are placed FARTHEST FIRST, so array order and distance
// order are exact opposites.
//
// ALL THREE ARE INSIDE THE RING'S FIRST STEP (reach 43.44 + a body's 12), on
// purpose: order is only decidable inside ONE pass. Spread them out and the
// edge reaches them on different frames, and what the hit list records is the
// passage of time rather than the iteration order this check is about.
{
  const ctx = bassCtx(true);
  const inst = BASS.create();
  const far = fakeTarget(0, 50);
  const mid = fakeTarget(0, 35);
  const nearBody = fakeTarget(0, 10);
  ctx.targets.push(far, mid, nearBody);
  inst.fire(ctx, bassTiers[3]);
  ctx.step(inst, 1);
  assert.equal(ctx.hits.length, 3, 'one pass, all three bodies');
  assert.deepEqual(ctx.hits.map((h) => h.t), [far, mid, nearBody],
    'damage order is the order the field was spawned in, not the order the edge reaches it');
}

// B12. THE ENEMY ARRAY IS LIVE AND GROWS UNDER THE LOOP. `ctx.all()` hands back
// the world's real array by reference, and a JS array iterator re-reads length,
// so a splitter killed by this ring pushes children that THIS SAME RING visits
// in THIS SAME PASS — already inside its radius, so hit immediately. A
// defensive `[...ctx.all()]` in the module deletes those hits and every draw
// behind them, and nothing else in this file would notice.
{
  class SplittingCtx extends FakeCtx {
    burst = false;
    override damage(t: WeaponTarget, amount: number): void {
      super.damage(t, amount);
      if (this.burst) return;
      this.burst = true;
      // A child at the parent's position: already inside the ring.
      this.targets.push(fakeTarget((t as FakeTarget).x, (t as FakeTarget).y));
    }
  }
  const ctx = new SplittingCtx();
  ctx.role = 'bass';
  ctx.color = KIT_COLORS.bass;
  ctx.evolved = true;
  const inst = BASS.create();
  ctx.targets.push(fakeTarget(0, 20));
  inst.fire(ctx, bassTiers[3]);
  ctx.step(inst, 1);
  assert.equal(ctx.hits.length, 2,
    'the child pushed by the parent\'s own hit is visited by the same ring in the same pass');
  assert.equal(ctx.targets.length, 2);
}

// B13. MID-EVOLVE. A base wave still in flight when the bass evolves keeps the
// base hit rule: onHit does not consult ctx.evolved, exactly as the role-keyed
// table it replaced did not. The two modes coexist in two different arrays.
{
  const ctx = bassCtx(false, [0.5]);
  const inst = BASS.create();
  const target = fakeTarget(300, 0);
  ctx.targets.push(target);
  inst.fire(ctx, bassTiers[3]);
  const inFlight = ctx.spawned[0];
  ctx.evolved = true;
  inst.fire(ctx, bassTiers[3]);
  assert.equal(ctx.rings.length, 1, 'the next trigger is a ring');
  assert.equal(ctx.spawned.length, 1, 'and the wave already in flight is still there');
  inst.projectile!.onHit!(ctx, inFlight, target);
  assert.deepEqual(ctx.shoveLog.map((s) => s.d), [6],
    'a base wave still in flight when the bass evolves keeps the base knock, not the ring\'s 14');
}

// B14. reset() has nothing to drop. Base waves live in the world's projectile
// array and rings in the world's shockwave array, and clearSandboxEntities
// empties both itself — the module holds no schedule of its own. Pinned so that
// stays true, and so a reset never draws or pushes anything.
{
  const ctx = bassCtx(true);
  const inst = BASS.create();
  ctx.targets.push(fakeTarget(60, 0));
  inst.fire(ctx, bassTiers[3]);
  inst.reset();
  assert.equal(ctx.hits.length, 0, 'a reset bass lands no delayed damage');
  assert.equal(ctx.fxLog.length, 0, 'and pushes no fx');
  assert.equal(ctx.rngDraws, 0, 'and never drew anything to begin with');
}


const chordTiers = CHORD.stats.tiers;

// ---------------------------------------------------------------------------
// The chord's tuning, pinned to LITERALS. Same rule as the kick, arp, snare,
// hat and bass blocks above: the right-hand sides are numbers a human typed
// after reading the pre-#141 config.ts and run.ts, never an expression that
// reads the value it is checking.
//
// ONE OF THESE IS UNREACHABLE IN A SHIPPED RUN, and that is exactly why it is
// here. `mergeMaxRadius` (180) can never decide anything: Afterhours needs tier
// 4 and Wide Lens at max, so every Afterhours zone is 76 x 1.30 x 1.55 = 153.14
// units and the first merge already asks for sqrt(2) x 153.14 = 216.57. The
// baseline agent replaced the whole `Math.min(180, Math.sqrt(...))` with
// `a.radius + b.radius` and moved ZERO of the 140 parity scenarios. The literal
// below and check C11 (which reaches the cap through a fake context, where
// areaMul is 1) are its only cover.
// ---------------------------------------------------------------------------
{
  // The per-tier ladder, verbatim from config.WEAPONS.chord. `damage` is PER
  // TICK, not per trigger, which is why the ladder looks so flat next to every
  // other kit: real output is damage x (1 + floor(lifetimeS / tickS)).
  assert.deepEqual(
    chordTiers.map((t) => [t.damage, t.radius, t.lifetimeS]),
    [
      [1, 48, 2.0],
      [1, 56, 2.2],
      [1, 64, 2.5],
      [2, 76, 2.8],
    ],
    'the chord damage/size/lifetime ladder moved',
  );
  assert.equal(chordTiers.length, TIER_COUNT, 'the chord ladder must have exactly TIER_COUNT rungs');
  // A zone is not a projectile: no speed, no pierce, nothing for the shared
  // projectile loop to read. Pinned so a later edit cannot quietly give one.
  assert.deepEqual(
    chordTiers.flatMap((t) => [t.speed, t.pierce, t.arc]).filter((v) => v !== undefined),
    [],
    'a chord zone has no speed, no pierce and no arc — it is not a shot',
  );
  assert.deepEqual(CHORD.stats.tierLines, [
    'zone on the nearest pack: damage + slow',
    'zones twice as often',
    'bigger, longer zones',
    'the biggest, longest, hardest zones',
  ], 'the chord pedestal copy moved');

  // The three config.ts constants that came with this weapon.
  assert.equal(CHORD.stats.throwRange, 420, 'the zone throw range moved (was ZONE_THROW_RANGE)');
  assert.equal(CHORD.stats.tickS, 0.9, 'the zone tick interval moved (was ZONE_TICK_S)');
  assert.equal(CHORD.stats.slowMul, 0.55, 'the base zone slow moved (was ZONE_SLOW_MUL)');
  // Bare literals in run.ts's spawnZone / updateZones.
  assert.equal(CHORD.stats.slowGraceS, 0.15, 'the slow grace moved (was the + 0.15 on slowT)');
  assert.equal(CHORD.stats.damageCapMul, 3, 'the zone damage cap multiplier moved');

  // THE RENEWAL RELATIONSHIP, stated as a check rather than a comment. A tick
  // renews every `tickS` and the slow it applies lasts `tickS + slowGraceS`, so
  // the slow is CONTINUOUS. The moment that stops being true a standing zone
  // starts strobing enemies back to full speed between ticks, and nothing else
  // in this file or the parity baseline would say why.
  assert(CHORD.stats.tickS + CHORD.stats.slowGraceS > CHORD.stats.tickS,
    'the slow must outlive the gap to the next tick, or a zone becomes a strobe');

  // Afterhours.
  assert.equal(CHORD.stats.afterhoursRadiusMul, 1.55, 'the Afterhours radius multiplier moved');
  assert.equal(CHORD.stats.afterhoursLifetimeMul, 1.35, 'the Afterhours lifetime multiplier moved');
  assert.equal(CHORD.stats.afterhoursDamageMul, 1.25, 'the Afterhours damage multiplier moved');
  assert.equal(CHORD.stats.afterhoursSlowMul, 0.42, 'the Afterhours slow moved');
  assert.equal(CHORD.stats.driftSpeed, 65, 'the Afterhours drift speed moved');
  assert.equal(CHORD.stats.driftSamples, 30, 'the Afterhours drift sample count moved');
  assert.equal(CHORD.stats.driftNeighborRadius, 120, 'the Afterhours neighbour radius moved');
  assert.equal(CHORD.stats.mergeMaxRadius, 180, 'the merge radius cap moved');
  assert.equal(CHORD.stats.mergeMaxLifeS, 4.5, 'the merge lifetime cap moved');
  assert.equal(CHORD.stats.mergeLifeMul, 0.25, 'the merge lifetime coefficient moved');
  assert.equal(CHORD.stats.mergeDamageMul, 0.5, 'the merge damage coefficient moved');

  assert.equal(WEAPONS.chord, undefined, 'the chord module is the only copy of the chord ladder');
  assert.equal(TIER_LINES.chord, undefined, 'the chord module is the only copy of the chord pedestal copy');

  // THE TWO ROLE-KEYED TABLES, AND THE CHORD IS IN NEITHER. It took nothing
  // when it left — a zone tick lands damage and a slow and nothing else, no
  // knock and no spark — so both absences are pinned the way the hat's block
  // pins its own. WEAPON_SHOVE is exported; SPARK_HIT_ROLES is a private const
  // in run.ts, so its membership is read out of the source rather than by
  // exporting a table purely to assert something is missing from it.
  assert(!('chord' in WEAPON_SHOVE), 'a chord tick has never had a knock, and must not gain one');
  {
    const runSource = readFileSync(new URL('./run.ts', import.meta.url), 'utf8');
    const sparkRoles = /SPARK_HIT_ROLES = new Set<Role>\(\[([^\]]*)\]\)/.exec(runSource)?.[1];
    assert(sparkRoles !== undefined,
      'this check cannot find SPARK_HIT_ROLES in run.ts, so it is asserting nothing. Update the ' +
      'pattern rather than deleting the check');
    assert(sparkRoles.includes("'lead'"),
      'guard integrity: lead is the last member of SPARK_HIT_ROLES and the set goes with it');
    assert(!sparkRoles.includes("'chord'"),
      'a chord tick pushes no spark and never has — its whole appearance is the view reading ' +
      'world.zones');
  }

  const chordModule = WEAPON_MODULES.find((m) => m.role === 'chord')!;
  assert.equal(chordModule.tickAt, 'zones',
    'the chord owns the zone pass, in the phase RunWorld.updateZones used to stand in — after ' +
    'the shared projectile loop and before the shockwaves');
  assert.equal(chordModule.create().projectile, undefined,
    'the chord spawns no projectile at all, so it has nothing to lend the shared projectile loop');
  assert.equal(CHORD.role, 'chord');
}

/** A fake context set up for the chord. Its rng() THROWS by default, which is
 *  what turns "the chord draws nothing from the run stream" into an executable
 *  assertion: this weapon throws at ctx.nearestEnemy, and `aimDir(0)` — the
 *  one-line-tidier spelling — would draw once with a target on screen and twice
 *  without. Nothing but a draw counter ever notices that. */
function chordCtx(evolved = false): FakeCtx {
  const ctx = new FakeCtx();
  ctx.role = 'chord';
  ctx.color = KIT_COLORS.chord;
  ctx.evolved = evolved;
  return ctx;
}

// C1. ONE TRIGGER, ONE ZONE, ZERO DRAWS, and the tier-4 spawn row as LITERALS.
// The zone is THROWN: it lands on the body, not on the player.
{
  const ctx = chordCtx();
  const inst = CHORD.create();
  ctx.targets.push(fakeTarget(300, 0));
  inst.fire(ctx, chordTiers[3]);
  assert.equal(ctx.rngDraws, 0, 'a chord trigger draws NOTHING — it looks, it does not jitter');
  assert.equal(ctx.fields.length, 1, 'one trigger, one zone');
  assert.equal(ctx.spawned.length, 0, 'the chord spawns no projectile');
  assert.equal(ctx.hits.length, 0, 'a zone deals its damage in tick(), never at fire time');
  assert.equal(ctx.slowLog.length, 0, 'and slows nothing at fire time either');
  assert.equal(ctx.fxLog.length, 0, 'the chord pushes NO fx: its whole appearance is the view');
  const z = ctx.fields[0];
  assert.equal(z.x, 300, 'the zone is thrown ONTO the nearest body, not dropped underfoot');
  assert.equal(z.y, 0);
  assert.equal(z.radius, 76, 'the tier-4 pedestal footprint');
  assert.equal(z.damage, 2, 'the tier-4 pedestal damage, PER TICK');
  assert.equal(z.lifeS, 2.8);
  assert.equal(z.tickT, 0,
    'a zone starts its timer at ZERO, which is why it lands one tick immediately instead of ' +
    'waiting out an interval first');
  assert.equal(z.slow, true);
  assert.equal(z.evolved, false);
  assert.equal(z.driftSpeed, 0, 'a base zone never moves');
  assert.equal(z.damageCap, 6, 'the cap is 3x the damage the zone spawned with');
  assert.equal(z.slowMul, 0.55);
  assert.equal(z.source, 'chord', 'attribution is the world\'s to fill in, not the module\'s');
  assert.equal(z.color, KIT_COLORS.chord);
}

// C2. THE THROW RANGE IS A STRICT BOUNDARY at 420, on SQUARED distances. A body
// one unit inside takes the zone; a body exactly on the line does not, and the
// zone falls back underfoot. Both sides, because a `<=` here would move only
// the exact-boundary case and nothing in the parity baseline sits on it.
{
  const inside = chordCtx();
  inside.targets.push(fakeTarget(419, 0));
  CHORD.create().fire(inside, chordTiers[3]);
  assert.equal(inside.fields[0].x, 419, 'a body inside 420 catches the throw');

  const outside = chordCtx();
  outside.targets.push(fakeTarget(420, 0));
  CHORD.create().fire(outside, chordTiers[3]);
  assert.equal(outside.fields[0].x, 0, 'a body exactly ON 420 is out of range — the test is `<`');
}

// C3. AN EMPTY SCREEN DROPS THE ZONE UNDERFOOT, at the fire-time player
// position, and still costs nothing from the run stream. This is the branch
// where `aimDir(0)` would have drawn TWICE.
{
  const ctx = chordCtx();
  ctx.player = { x: 90, y: -40, facingX: 1 };
  CHORD.create().fire(ctx, chordTiers[3]);
  assert.equal(ctx.rngDraws, 0, 'no target on screen still means no draw');
  assert.deepEqual([ctx.fields[0].x, ctx.fields[0].y], [90, -40], 'the zone lands on the player');
}

// C4. THE TICK GRID: one tick immediately, then one every 0.9s for the zone's
// whole life. `1 + floor(2.8 / 0.9)` is FOUR, and the zone is gone by the end
// of the run of frames. A zone whose timer started at tickS instead of zero
// would land three.
{
  const ctx = chordCtx();
  const inst = CHORD.create();
  const target = fakeTarget(0, 0);
  ctx.targets.push(target);
  inst.fire(ctx, chordTiers[3]);
  ctx.step(inst, 1);
  assert.equal(round6(ctx.fields[0].tickT), 0.9,
    'the timer is RESET to tickS, not topped up by it. `tickT += tickS` looks equivalent and is ' +
    'not: the timer is already slightly negative when it fires, so accumulating carries that ' +
    'remainder forward and every later tick in the run drifts');
  ctx.step(inst, 199);
  assert.equal(ctx.hits.length, 4, 'a tier-4 base zone lands 1 + floor(2.8 / 0.9) = 4 ticks');
  assert.deepEqual(ctx.hits.map((h) => h.amount), [2, 2, 2, 2], 'every tick is the same chip');
  assert.equal(ctx.fields.length, 0, 'and the zone retires at the end of its life');
  assert.equal(ctx.rngDraws, 0, 'ticking a zone draws nothing');
  assert.equal(ctx.fxLog.length, 0, 'and pushes nothing');
  assert.deepEqual(ctx.knocks, [], 'a zone tick lands damage and a slow and NO knock');
}

// C5. REACH IS `zone.radius + body.radius`, STRICTLY. The zone is dropped
// underfoot and the bodies arrive afterwards, so this measures the footprint
// and not the throw: 76 + 12 = 88, and 88 exactly is a miss.
{
  const ctx = chordCtx();
  const inst = CHORD.create();
  inst.fire(ctx, chordTiers[3]);
  const grazing = fakeTarget(87, 0);
  const clear = fakeTarget(88, 0);
  ctx.targets.push(grazing, clear);
  ctx.step(inst, 1);
  assert.deepEqual(ctx.hits.map((h) => h.t), [grazing],
    'reach is the zone radius PLUS the body radius, and the boundary itself is out');
}

// C5b. A DEAD BODY IS BILLED BY NEITHER PASS. ctx.near() is a SUPERSET that
// includes the dead — the caller runs the shape test AND the liveness test —
// and both of the chord's two loops over it need their own `!e.dead`. Dropping
// either one is invisible until an earlier zone's tick kills something that a
// later zone then hits again in the same frame.
{
  const ctx = chordCtx();
  const inst = CHORD.create();
  inst.fire(ctx, chordTiers[3]);
  ctx.targets.push(fakeTarget(20, 0, { dead: true }));
  ctx.step(inst, 1);
  assert.equal(ctx.hits.length, 0, 'a dead body under the zone takes no damage');
  assert.equal(ctx.slowLog.length, 0, 'and is not slowed either — both loops test liveness');
}

// C6. THE SLOW: 0.55 for 1.05 seconds, written on everything the tick covers,
// and it is a min() FOLD rather than an assignment. The body arrives already
// carrying a harsher multiplier, which the chord must not lift.
{
  const ctx = chordCtx();
  const inst = CHORD.create();
  const fresh = fakeTarget(0, 0);
  const alreadySlower = fakeTarget(20, 0, { zoneSlowMul: 0.3 });
  ctx.targets.push(fresh, alreadySlower);
  inst.fire(ctx, chordTiers[3]);
  ctx.step(inst, 1);
  assert.deepEqual(ctx.slowLog.map((s) => [s.mul, round6(s.durationS)]), [[0.55, 1.05], [0.55, 1.05]],
    'every body under the zone takes 0.55 for tickS + slowGraceS = 1.05s');
  assert.equal(fresh.zoneSlowMul, 0.55);
  assert.equal(alreadySlower.zoneSlowMul, 0.3,
    'the fold is a min(): a chord tick can only ever make a body slower, never faster');
  assert.equal(round6(alreadySlower.slowT), 1.05, 'but the TIMER is assigned outright, not max()\'d');
}

// C7. AFTERHOURS, AS LITERALS. Every multiplier is applied to the tier-4 rung,
// and the cap is 3x the EVOLVED damage — a merge can take an Afterhours zone to
// 7.5 per tick, not 6.
{
  const ctx = chordCtx(true);
  const inst = CHORD.create();
  inst.fire(ctx, chordTiers[3]);
  const z = ctx.fields[0];
  assert.equal(round6(z.radius), 117.8, 'tier-4 76 x 1.55');
  assert.equal(round6(z.lifeS), 3.78, 'tier-4 2.8 x 1.35');
  assert.equal(z.damage, 2.5, 'tier-4 2 x 1.25');
  assert.equal(z.damageCap, 7.5, 'and the cap is 3x THAT');
  assert.equal(z.slowMul, 0.42, 'Afterhours wades harder than the base 0.55');
  assert.equal(z.driftSpeed, 65);
  assert.equal(z.evolved, true);
  assert.equal(ctx.rngDraws, 0, 'Afterhours does not aim either');
  assert.equal(ctx.fxLog.length, 0, 'and pushes no fx');
}

// C8. THE EVOLVED MULTIPLIERS STACK ON TOP OF THE BUILD PIPELINE. `conf`
// arrives already carrying areaMul in `radius`, so Wide Lens at max and
// Afterhours together are 76 x 1.30 x 1.55 = 153.14 — the number every real
// Afterhours zone in a shipped run is, and the reason the merge radius cap can
// never bind out there.
{
  const ctx = chordCtx(true);
  CHORD.create().fire(ctx, { ...chordTiers[3], radius: 76 * 1.3 });
  assert.equal(round6(ctx.fields[0].radius), 153.14, 'areaMul first, then the Afterhours 1.55');
}

// C9. THE DRIFT: 65 units a second toward the densest pack, and a BASE zone
// does not move at all. The zone is dropped underfoot on an empty screen and
// the crowd arrives afterwards, so the throw cannot be what moved it.
{
  for (const evolved of [false, true]) {
    const ctx = chordCtx(evolved);
    const inst = CHORD.create();
    inst.fire(ctx, chordTiers[3]);
    // Far outside the zone's own footprint, so nothing here is about damage.
    for (let i = 0; i < 5; i++) ctx.targets.push(fakeTarget(300 + i * 10, 0));
    ctx.step(inst, 1);
    assert.equal(round6(ctx.fields[0].x), evolved ? round6(65 / 60) : 0,
      evolved ? 'an Afterhours zone crawls 65 units a second toward the crowd'
              : 'a BASE zone never moves, whatever is on screen');
  }
}

// C10. THE SAMPLING STRIDE IS BEHAVIOR. With 61 bodies the stride is
// `max(1, floor(61 / 30))` = 2, so the drift only ever LOOKS at even indices.
// The even bodies are a loose ring out at +x (about four neighbours each); the
// odd bodies are thirty coincident points at -x (thirty neighbours each). A
// full scan would find the packed clump and drive the zone to -x. The stride
// cannot see it, and the zone goes the other way.
{
  const ctx = chordCtx(true);
  const inst = CHORD.create();
  inst.fire(ctx, chordTiers[3]);
  for (let i = 0; i < 61; i++) {
    if (i % 2 === 0) {
      const angle = (Math.PI * 2 * i) / 61;
      ctx.targets.push(fakeTarget(400 + Math.cos(angle) * 300, Math.sin(angle) * 300));
    } else {
      ctx.targets.push(fakeTarget(-400, 0));
    }
  }
  ctx.step(inst, 1);
  assert(ctx.fields[0].x > 0,
    'the drift stepped past every packed body because they all sat on odd indices — "tidying" ' +
    'the stride into a full scan sends every Afterhours zone somewhere else');
  assert.equal(round6(Math.hypot(ctx.fields[0].x, ctx.fields[0].y)), round6(65 / 60),
    'and it still travelled exactly one frame of drift');
}

// C11. THE MERGE, AND `a` IS THE NEWER ZONE. Two Afterhours zones overlap; the
// one thrown SECOND survives, absorbs the first and keeps its OWN damage cap.
// The two are given different damage so the survivor is identifiable: newer
// wins gives 5 + 2.5 x 0.5 = 6.25, older wins would give 2.5 + 5 x 0.5 = 5.
{
  const ctx = chordCtx(true);
  const inst = CHORD.create();
  ctx.targets.push(fakeTarget(0, 0));
  inst.fire(ctx, chordTiers[3]);                       // damage 2.5 at (0, 0)
  ctx.targets.length = 0;
  ctx.targets.push(fakeTarget(10, 0));
  inst.fire(ctx, { ...chordTiers[3], damage: 4 });      // damage 5 at (10, 0)
  ctx.targets.length = 0;
  const older = ctx.fields[0];
  const newer = ctx.fields[1];
  ctx.step(inst, 1);
  assert.deepEqual(ctx.fields, [newer], 'the SURVIVOR is the zone thrown second');
  assert.equal(round6(newer.damage), 6.25, 'the survivor takes half the absorbed zone\'s damage');
  assert.equal(newer.damageCap, 15, 'and keeps its own cap, not the absorbed zone\'s');
  assert.equal(round6(newer.x), 5, 'the centre is the area-weighted centroid of the two');
  assert.equal(round6(newer.y), 0);
  // sqrt(117.8^2 + 117.8^2) = 166.594... — under the 180 cap ONLY because a
  // fake context has areaMul 1. In a shipped run the first merge already asks
  // for 216.57 and the cap decides, which is why the cap has a literal pin.
  assert.equal(round6(newer.radius), round6(Math.sqrt(2 * 117.8 * 117.8)),
    'the merged radius is sqrt(r_a^2 + r_b^2) under the cap');
  assert(newer.radius < CHORD.stats.mergeMaxRadius);
  assert.equal(older.evolved, true, 'the absorbed zone object itself is untouched, just dropped');
}

// C11b. THE PARTNER IS THE NEAREST LOWER INDEX, not the oldest overlapping
// zone. With three zones on one line the inner scan walks DOWN from `a`, so the
// newest zone absorbs the MIDDLE one and the oldest is left alone; scanning up
// from zero instead would absorb the oldest and leave the middle. Both spellings
// keep `i -= 1` correct and both halve a uniform field identically, so a
// cascade of identical zones cannot tell them apart — only distinct damage can.
{
  const ctx = chordCtx(true);
  const inst = CHORD.create();
  for (const [damage, x] of [[2, 0], [4, 10], [8, 20]] as const) {
    ctx.targets.length = 0;
    ctx.targets.push(fakeTarget(x, 0));
    inst.fire(ctx, { ...chordTiers[3], damage });
  }
  ctx.targets.length = 0;
  ctx.step(inst, 1);
  assert.deepEqual(ctx.fields.map((z) => round6(z.damage)), [2.5, 12.5],
    'the newest zone (10 per tick) absorbed the MIDDLE one (5), not the oldest (2.5) — ' +
    'absorbing the oldest would leave [5, 11.25]');
  assert.equal(round6(ctx.fields[1].x), 15, 'and the centroid is of those two, not of the ends');
}

// C12. A BASE ZONE IS IMMUNE TO THE MERGE PASS, from both sides, and the flag
// is frozen at SPAWN rather than read live. The weapon evolves between the two
// triggers, so one base and one Afterhours zone sit on the same spot.
//
// THIS IS ALSO THE ONLY PLACE THE min() SLOW COMBINATION IS VISIBLE, and the
// tick order it pins is NEWEST FIRST: the Afterhours zone bills its 2.5 before
// the base zone bills its 2.
{
  const ctx = chordCtx();
  const inst = CHORD.create();
  const body = fakeTarget(0, 0);
  ctx.targets.push(body);
  inst.fire(ctx, chordTiers[3]);
  ctx.evolved = true;
  inst.fire(ctx, chordTiers[3]);
  ctx.step(inst, 1);
  assert.equal(ctx.fields.length, 2, 'a base zone cannot be absorbed, and cannot absorb');
  assert.deepEqual(ctx.fields.map((z) => z.evolved), [false, true],
    'the base zone kept base behavior across the evolution — evolved is frozen at spawn');
  assert.equal(ctx.fields[0].driftSpeed, 0, 'and it still does not drift');
  assert.deepEqual(ctx.hits.map((h) => h.amount), [2.5, 2],
    'zones tick NEWEST FIRST: the Afterhours zone billed before the base zone');
  assert.deepEqual(ctx.slowLog.map((s) => s.mul), [0.42, 0.55],
    'and both zones wrote their own slow');
  assert.equal(body.zoneSlowMul, 0.42,
    'the body keeps the HARSHER of the two — a plain assignment would have left it at 0.55');
}

// C13. THE SAME-FRAME CASCADE. `i -= 1; break;` halves the population in one
// pass, which is the only route to the damage cap and the lifetime cap at all:
// zones arriving one trigger at a time converge on 5 per tick and never bind
// either. Ten zones on one spot, then three frames.
{
  const ctx = chordCtx(true);
  const inst = CHORD.create();
  for (let i = 0; i < 10; i++) inst.fire(ctx, chordTiers[3]);
  assert.equal(ctx.fields.length, 10);
  ctx.step(inst, 1);
  assert.equal(ctx.fields.length, 5, 'one pass halves the field — that is what `i -= 1` buys');
  ctx.step(inst, 1);
  assert.equal(ctx.fields.length, 3);
  ctx.step(inst, 1);
  assert.equal(ctx.fields.length, 2);
  const supercell = ctx.fields[ctx.fields.length - 1];
  assert.equal(round6(supercell.damage), 7.5, 'the cascade is the only thing that reaches the cap');
  assert.equal(supercell.damage, supercell.damageCap);
  assert.equal(round6(supercell.lifeS), 4.5, 'and the lifetime cap binds too');
  assert.equal(round6(supercell.radius), 180, 'and so does the radius cap');
  assert.equal(ctx.rngDraws, 0, 'merging draws nothing');
  assert.equal(ctx.fxLog.length, 0, 'and pushes nothing');
}

// C14. TICKS RUN BEFORE MERGES. Two overlapping Afterhours zones on one body
// both land their scheduled tick in the frame they merge in — the merge pass
// runs after the tick loop, so absorbing a zone can never swallow a tick that
// was already due. Merge first and the field quietly loses damage every time
// two zones meet.
{
  const ctx = chordCtx(true);
  const inst = CHORD.create();
  ctx.targets.push(fakeTarget(0, 0));
  inst.fire(ctx, chordTiers[3]);
  inst.fire(ctx, chordTiers[3]);
  ctx.step(inst, 1);
  assert.deepEqual(ctx.hits.map((h) => h.amount), [2.5, 2.5],
    'both zones billed their due tick in the frame they merged');
  assert.equal(ctx.fields.length, 1, 'and then became one');
}

// C15. reset() has nothing to drop. Every zone lives in the world's zone array,
// which clearSandboxEntities empties itself — the module holds no schedule of
// its own. Pinned so that stays true, and so a reset never draws or pushes
// anything.
{
  const ctx = chordCtx(true);
  const inst = CHORD.create();
  ctx.targets.push(fakeTarget(60, 0));
  inst.fire(ctx, chordTiers[3]);
  inst.reset();
  assert.equal(ctx.hits.length, 0, 'a reset chord lands no delayed damage');
  assert.equal(ctx.slowLog.length, 0, 'and no delayed slow');
  assert.equal(ctx.fxLog.length, 0, 'and pushes no fx');
  assert.equal(ctx.rngDraws, 0, 'and never drew anything to begin with');
}

// ---------------------------------------------------------------------------
// 11. THE WORLD SIDE OF THE SEAM: the tick call site.
//
// Every check above (1-10) drives the module through a fake context and calls
// inst.tick() directly. That pins the module's contract and pins nothing about
// how the WORLD calls it. RunWorld.update() ticks migrated weapons by phase —
// `this.tickWeapons('strikes', dt)` — and TickPhase has five legal names, so
// mis-wiring that line to a phase no module declares is a clean compile, a
// silent no-op, and every one of checks 1-10 still passing while all base kick
// damage becomes zero.
//
// So: a REAL RunWorld. Add the weapon, place an enemy at a known offset, fire
// one trigger, step real frames through update(), and assert the hp dropped by
// a LITERAL amount. Nothing here reads KICK.stats; the numbers on the right are
// the ones a designer would recognize off the pedestal.
//
// EVERY WEAPON THAT MIGRATES LATER NEEDS THIS. `worldStrike` is the reusable
// shape: it is role-agnostic, so a new weapon is a new call, not a new harness.
// The broad behavioral net lives next door in weapon-parity-check.ts; this is
// the small, named, obvious-on-failure version.
// ---------------------------------------------------------------------------

/** Drive one trigger of one weapon through a REAL RunWorld and report what it
 *  did to hand-placed enemies. Deterministic: seeded rng, fixed step, fixed
 *  canvas, no stage director. */
function worldStrike(opts: {
  role: Role;
  tier: number;
  /** Item to max out, when the scenario needs an evolution or a build number. */
  item?: ItemId;
  evolve?: boolean;
  /** [dx, dy] offsets from the player. Circle centers are pinned after spawn. */
  offsets: readonly (readonly [number, number])[];
  /** Park the targets: speed 0, so they stay exactly where they were placed.
   *  Weapons that resolve in a frame or two do not need it. An arp orbiter
   *  takes 1.85s to come around, and a chasing zombie has walked off the ring
   *  long before then — freezing is what makes the placement mean anything for
   *  a weapon measured over seconds instead of frames. */
  frozen?: boolean;
  /** Frames of 1/60 to run after the trigger. Zero for weapons that resolve
   *  synchronously at fire time. */
  frames: number;
  /** Runs BETWEEN the trigger and the frames, on the real world. The pierce
   *  exemption check below is the only caller: it needs to reach into a live
   *  orbiter and give it a finite pierce budget, because the budget a spawner
   *  arms is Infinity and Infinity is arithmetically immune to the very rule
   *  the check exists to measure. */
  afterFire?: (world: RunWorld) => void;
}): { drops: number[]; damageDealt: number; world: RunWorld } {
  const world = new RunWorld({ width: 1280, height: 720 }, events, {
    scripted: false,
    fx: false,
    rng: mulberry32(0x7e57),
  });
  world.invincible = true;
  world.addWeapon(opts.role, opts.tier);
  if (opts.item) world.addItem(opts.item, 5);
  if (opts.evolve) assert(world.evolve(opts.role), `${opts.role} is not eligible to evolve`);

  const placed = opts.offsets.map(([dx, dy]) => {
    const e = world.spawnEnemyAt('zombie', world.player.x + dx, world.player.y + dy)!;
    // spawnEnemyAt takes a sprite-feet position and stores an offset circle
    // center, so pin the center or the geometry under test is off by the foot
    // offset. Absurd hp makes each enemy a damage meter: a target that dies
    // hides exactly the difference this check exists to measure.
    e.x = world.player.x + dx;
    e.y = world.player.y + dy;
    e.hp = 1e6;
    if (opts.frozen) e.speed = 0;
    return e;
  });
  // Build the spatial hash at the pinned positions; the strip queries it.
  world.update(0);

  const before = placed.map((e) => e.hp);
  world.fireTrigger({ role: opts.role, time: 0, velocity: 1, step: 0 });
  opts.afterFire?.(world);
  for (let i = 0; i < opts.frames; i++) world.update(1 / 60);

  return {
    drops: placed.map((e, i) => before[i] - e.hp),
    damageDealt: world.damageByRole[opts.role] ?? 0,
    world,
  };
}

{
  // Deep inside the strip at every tier, so this measures DAMAGE and nothing
  // else. One trigger, one hit, and the drop is the pedestal number.
  // Twelve frames is exactly KICK liveS at 1/60 — the whole strike.
  const ladder = [3, 5, 9, 15];
  for (let tier = 1; tier <= 4; tier++) {
    const { drops, damageDealt } = worldStrike({
      role: 'kick',
      tier,
      offsets: [[40, 0]],
      frames: 12,
    });
    assert.equal(drops[0], ladder[tier - 1],
      `a tier-${tier} kick trigger must take exactly ${ladder[tier - 1]} hp off an enemy ` +
      'inside the strip, through RunWorld.update() — a zero here means the world never ' +
      "ticked the module (check RunWorld.update's tickWeapons phase against KICK.tickAt)");
    assert.equal(damageDealt, ladder[tier - 1],
      `tier-${tier} kick damage must be attributed to the kick`);
  }

  // The strip is a FACING-SIDE strip of finite reach, and this is where that
  // shape is measured against the world's own spatial hash rather than a
  // hand-written near() filter. Tier 1 deliberately: no opposite-side follow-up
  // to muddy which side got hit.
  //   40   deep inside          -> hit
  //   110  inside full reach    -> hit  (a halved stripBaseWidth loses this one)
  //   200  past the strip       -> miss
  //   -60  behind the player    -> miss (facing is +X)
  //   40 x 26  inside thickness -> hit  (a halved stripBaseHeight loses this one)
  const reach = worldStrike({
    role: 'kick',
    tier: 1,
    offsets: [[40, 0], [110, 0], [200, 0], [-60, 0], [40, 26]],
    frames: 12,
  });
  assert.deepEqual(reach.drops, [3, 3, 0, 0, 3],
    'the base strip reaches one facing side, out to its full width and thickness, and no further');

  // Redline Stomp resolves synchronously at fire time — zero frames — and the
  // drop carries the evolution multiplier. 15 * 1.35.
  const stomp = worldStrike({
    role: 'kick',
    tier: 4,
    item: 'highTops',
    evolve: true,
    // On the +X arm, on the +Y arm, and out in a corner the cross cannot reach.
    offsets: [[600, 0], [0, 300], [500, 300]],
    frames: 0,
  });
  assert.deepEqual(stomp.drops, [20.25, 20.25, 0],
    'Redline Stomp crosses the arena for 15 * 1.35 damage and does not fill the corners');
}

{
  // THE WORLD SIDE OF ProjectileBehavior. Nothing but RunWorld.updateProjectiles
  // ever calls steer() or onHit(), so a mis-wired loop is a silent zero here
  // while every fake-context check above stays green.
  //
  // A tier-4 orbiter: radius 122, 3.4 rad/s, 3.2s of life — a bit under two
  // full revolutions, so an enemy sitting on the ring is swept at least once.
  //   122  on the ring     -> chipped
  //   20   inside the orbit-> never touched (an orbit is not a zone)
  //   300  outside         -> never touched (an orbiter never leaves its orbit)
  // 200 frames is 3.33s, just past the orbiter's 3.2s life, so the whole
  // lifetime is inside the window and expiry is under test too.
  const orbit = worldStrike({
    role: 'arp',
    tier: 4,
    offsets: [[122, 0], [20, 0], [300, 0]],
    frozen: true,
    frames: 200,
  });
  assert(orbit.drops[0] > 0,
    'a tier-4 orbiter must chip an enemy sitting on its orbit, through RunWorld.update() — ' +
    'a zero here means the shared projectile loop never called ARP.projectile.steer()');
  assert.equal(orbit.drops[0] % 3, 0, 'every chip from a tier-4 orbiter is exactly 3 damage');
  assert.equal(orbit.drops[1], 0, 'an orbiter never reaches inside its own orbit');
  assert.equal(orbit.drops[2], 0, 'an orbiter never leaves its orbit');

  // THE PIERCE EXEMPTION, measured through the real loop (ADR-0002).
  //
  // WHY THIS IS NOT JUST "one orbiter sweeps twelve enemies". It used to be,
  // and that check was VACUOUS: an arp spawner arms its orbiters with Infinity
  // pierce (armOrbiterPierce), and `Infinity - 1` is still Infinity, so the
  // shared `pr.pierce -= 1` can run on every single hit and the orbiter never
  // dies. Deleting ARP.projectile.onHit entirely — replacing it with `return
  // true` — left the whole sweep, all 35 parity scenarios and every check in
  // this file green. Nothing measured the exemption.
  //
  // So: hand ONE live orbiter a FINITE pierce budget, then sweep it through the
  // ring. That is the only way the question becomes answerable from outside.
  //   onHit declining the rule  -> the budget is never touched: 12 enemies
  //                                chipped and pierce comes back at exactly 3.
  //   the rule applied          -> the budget is spent on hits 1, 2 and 3, the
  //                                orbiter's lifeS is zeroed on the third, and
  //                                the remaining nine enemies are never reached.
  // The budget of 3 is a probe, not a tuning number: it exists only inside this
  // check, and it is smaller than the ring so the difference is unmissable.
  const ring = Array.from({ length: 12 }, (_, i) => {
    const a = (Math.PI * 2 * i) / 12;
    return [122 * Math.cos(a), 122 * Math.sin(a)] as const;
  });
  const PROBE_PIERCE = 3;
  let probed: Projectile | undefined;
  const sweep = worldStrike({
    role: 'arp',
    tier: 4,
    offsets: ring,
    frozen: true,
    frames: 200,
    afterFire: (world) => {
      probed = world.projectiles.find((pr) => pr.role === 'arp');
      assert(probed, 'an arp trigger must put an orbiter in the world');
      probed.pierce = PROBE_PIERCE;
      probed.maxPierce = PROBE_PIERCE;
    },
  });
  assert.equal(sweep.drops.filter((d) => d > 0).length, 12,
    'one orbiter must chip ALL twelve enemies on its ring even while carrying a pierce budget ' +
    `of only ${PROBE_PIERCE}: it chips on a timer and never spends pierce (ADR-0002). Fewer ` +
    'than twelve here means the shared pierce rule reached an orbiter and killed it mid-sweep — ' +
    'check that ARP.projectile.onHit still returns ARP_STATS.spendsPierce (false).');
  assert.equal(probed!.pierce, PROBE_PIERCE,
    'the shared projectile loop must never decrement an orbiter pierce budget. A value below ' +
    `${PROBE_PIERCE} means onHit returned true and the orbiter is spending pierce like every ` +
    'other shot, which is the mechanism ADR-0002 exists to exempt it from.');
  assert(sweep.damageDealt >= 12 * 3,
    'one orbiter must sweep a whole ring, chipping every enemy on it for the tier-4 damage');
  assert.equal(sweep.world.projectiles.filter((pr) => pr.role === 'arp').length, 0,
    'the orbiter still dies of old age, like every other projectile');

  // And the belt: with no probe, a real orbiter carries the budget its own stat
  // implies. This is the assertion that keeps armOrbiterPierce derived from
  // ARP_STATS.spendsPierce rather than being a bare `pr.pierce = Infinity`.
  const armed = worldStrike({ role: 'arp', tier: 4, offsets: [[122, 0]], frozen: true, frames: 0 });
  const orbiter = armed.world.projectiles.find((pr) => pr.role === 'arp')!;
  assert.equal(orbiter.pierce, ARP.stats.spendsPierce ? orbiter.maxPierce : Infinity,
    'an orbiter is armed with the pierce budget ARP_STATS.spendsPierce implies — the stat is ' +
    'the single source, not a literal at the spawn site');
}

{
  // NEON SERPENT'S 320-UNIT HOMING GATE. Collateral of #140: the arp extraction
  // rewrote this out of the shared loop (it was a `pr.role !== 'lead'` test)
  // and onto the shot as `pr.homingRange`. That made it an UNMIGRATED weapon's
  // behavior, moved by another weapon's commit and pinned by nothing —
  // `pr.homingRange = Infinity`, which deletes the gate outright, passed every
  // check and all 35 parity scenarios. So it is pinned here, from both sides.
  //
  // The shape: a BAIT enemy at +60 on the firing axis takes the aim lock and
  // the first hit, which puts it in the shot's hit set and frees the seeker to
  // look for a second target. The second target then sits OFF the firing axis,
  // so the only way it is ever reached is a homing turn.
  //   250 off-axis -> inside the gate  -> homed onto and chipped
  //   500 off-axis -> outside the gate -> never touched; the seeker rails past
  // Tier 4 with pierce 6 and 380 speed over 2.4s travels ~912 units, so reach
  // is not what stops it at 500 — the gate is.
  const NEON = { role: 'lead' as const, tier: 4, item: 'needleTips' as const, evolve: true };
  const inside = worldStrike({ ...NEON, offsets: [[60, 0], [0, 250]], frozen: true, frames: 150 });
  assert(inside.drops[1] > 0,
    'Neon Serpent must home onto a target 250 units away — inside its 320-unit gate. A zero ' +
    'here means the seeker stopped homing at all (check pr.homingRange and pr.homing at spawn)');
  const outside = worldStrike({ ...NEON, offsets: [[60, 0], [0, 500]], frozen: true, frames: 150 });
  assert.equal(outside.drops[1], 0,
    'Neon Serpent must NOT home onto a target 500 units away: it snaps to what is close ' +
    'instead of crossing the screen, and that is the 320-unit gate on pr.homingRange set in ' +
    'spawnProjectile. Damage here means the gate was widened or removed — it is an unmigrated ' +
    "weapon's tuning, so it does not move without the lead's own issue saying so.");
}

// ---------------------------------------------------------------------------
// THE RULE #140 EXISTS TO ESTABLISH: the world's SHARED physics loops contain
// ZERO per-weapon branches, permanently.
//
// This is the one invariant seven more extractions depend on, and it is exactly
// the kind of rule that decays the moment it is only written down. Weapon eight
// will have some motion that "just needs one small branch here", and a code
// review is a bad place to catch it. So the rule is read out of run.ts's own
// source and enforced.
//
// Weapon-specific motion belongs to the owning weapon module, lent back through
// ProjectileBehavior. Anything else a shot needs is a FIELD ON THE SHOT, set by
// whatever spawned it — that is how the arp's orbit and the evolved lead's
// homing range both left the projectile loop.
//
// WHAT THE FIRST VERSION OF THIS GUARD GOT WRONG (fixed here, #140 follow-up).
// It matched `/\.role\s*[=!]==/`, i.e. strict equality on a `.role` property
// access, over a slice of source taken BETWEEN two method names. Every one of
// these went into updateProjectiles and passed the full `npm run verify`:
//
//     if (p.role != 'kick') { ... }                            // loose equality
//     switch (p.role) { case 'arp': break; default: break; }   // switch
//     const r = pr.role; if (r === 'bell') { ... }             // via a local
//     if (({ arp: 1 } as Record<string, number>)[pr.role]) {}  // keyed lookup
//
// and moving reflectProjectileFromArena below spawnZone dropped it out of the
// scanned slice while the guard's own integrity assert stayed green. Coverage
// defined by source ORDERING is not coverage.
//
// SO THE RULE IS INVERTED. Instead of blacklisting spellings of a branch — an
// endless game the writer always wins — a protected method may not mention a
// role AT ALL except in the handful of approved, opaque forms listed below:
//   1. no access to a role-bearing property (`.role`, `.source`) survives
//      unless it matches an approved form exactly, and
//   2. no Role name may appear as a string literal in a protected method.
// Those catch equality (either kind), switch dispatch, a role parked in a
// local read via `.role`, role-keyed object/Map/Set lookups, and `.includes`.
//
// ---------------------------------------------------------------------------
// READ THIS BEFORE YOU TRUST IT. This check is a TRIPWIRE, NOT AN ENFORCEMENT.
// It is a text scan, and text scans lose. Every one of these was verified to
// pass a full green `npm run verify` against the commit that introduced this
// guard:
//   - `const { role: rr } = pr;`     destructuring, so no `.role` survives
//   - `pr['role']`                   bracket access, so the dot never appears
//   - a per-weapon `switch` moved into a NEW private method that the protected
//     method simply calls — the branch sits one call frame outside the scan
// The third is not exotic; it is the ordinary refactor anyone reaches for, and
// it defeats this check completely. The INTERIM_EXCEPTIONS count below has the
// same weakness: it bounds one exact SPELLING, not one USE, so a second use
// written differently slips through.
//
// So do not read a green systems-check as proof that shared physics is free of
// per-weapon branches. It proves only that nobody wrote one the obvious way.
// The real fix is structural — give the shared loops a view of a projectile
// that has no `role` field at all, so a branch will not COMPILE — and that is
// tracked as its own issue for #141's finish line. Until then this catches the
// careless case and review catches the rest.
// ---------------------------------------------------------------------------
//
// SPAWNERS ARE NOT COVERED and deliberately so: baseProjectile and
// spawnProjectile still branch on role for the four unmigrated projectile
// weapons, and each of those branches leaves with its own weapon's module.
// ---------------------------------------------------------------------------
{
  const source = readFileSync(new URL('./run.ts', import.meta.url), 'utf8');

  /** The shared loops every weapon's entities ride. #140 named the projectile
   *  loop and the arena rails; it named shared ZONE physics too, and the zone,
   *  shockwave and gravity-well loops were never scanned at all. They are now:
   *  chord and bell migrate into two of those loops next, and each will arrive
   *  wanting "one small branch here".
   *
   *  `updateShockwaves` was on this list and is NOT any more, because the bass
   *  extraction (#141) DELETED it: shockwave storage stays on the world, but
   *  the growth/damage/retire loop moved wholesale into weapons/bass.ts, which
   *  is now the array's sole mutator. That is the outcome this guard exists to
   *  push toward, not a hole in it — a method removed from here because the
   *  code left run.ts is the good ending, a method removed because it was
   *  RENAMED is the bad one, and the `methodBody` assert below is what tells
   *  the two apart for everything still listed.
   *
   *  `updateZones` has now gone the same way with the CHORD (#141), and it is
   *  the first one that mattered while it was still here: the chord's whole
   *  pass lived inside a protected method, so "leave the loop and branch on
   *  z.source" was never an option and the loop had to move. Zone storage stays
   *  on the world; ticks, the Afterhours drift, the merge pass and retirement
   *  are weapons/chord.ts, the array's sole mutator. When the wells follow with
   *  the bell, this list shrinks to the two genuinely shared projectile
   *  loops. */
  const PROTECTED_METHODS = [
    'updateProjectiles',
    'reflectProjectileFromArena',
    'updateGravityWells',
  ] as const;

  /** One approved way for a shared loop to name a role. */
  interface RoleUse {
    /** The EXACT source text, matched literally. Reformatting the line is
     *  supposed to trip the staleness check below — an approved form is
     *  approved as written, not as a pattern that might grow to fit. */
    readonly snippet: string;
    readonly why: string;
  }

  /** THE ONLY FORMS in which a shared loop may name a role at all. In every one
   *  the role is an OPAQUE key: it is handed to damage attribution, or to the
   *  generic module seam that turns "some role" into "that weapon's own code".
   *  None of them asks WHICH weapon it is, and none of them grows a case when a
   *  tenth weapon appears. That is the test for adding one here. */
  const GENERIC_ROLE_USE: readonly RoleUse[] = [
    {
      snippet: 'this.projectileBehavior(pr.role)',
      why: 'the generic module seam: a role in, that weapon\'s own steer/onHit out',
    },
    {
      snippet: 'this.weaponCtx.get(pr.role)!',
      why: 'the generic module seam: a role in, that weapon\'s own context out',
    },
    {
      snippet: 'this.damageEnemy(e, pr.damage, pr.role)',
      why: 'damage ATTRIBUTION — which weapon gets the credit, not which weapon acts',
    },
    // `this.damageArea(z.x, z.y, z.radius, z.damage, z.source)` was here,
    // approved as damage attribution for a zone tick, and
    // `this.damageEnemy(enemy, wave.damage, wave.source)` before it for a
    // shockwave hit. Each went with its whole loop — the chord's and the bass's
    // (#141) — and each module now bills through ctx.damage, whose role is
    // bound at construction and cannot be forged.
  ];

  interface InterimException extends RoleUse {
    /** Exact number of occurrences allowed across ALL protected methods. Exact,
     *  not a minimum: a SECOND use of an allowed table is a new per-weapon
     *  branch and has to be argued for. */
    readonly count: number;
    /** The weapon whose extraction deletes this entry. */
    readonly deletedBy: string;
  }

  // ---- KNOWN INTERIM EXCEPTIONS ------------------------------------------
  //
  // THIS LIST MUST BE EMPTY WHEN #141 FINISHES. Two role-keyed tables still sit
  // in the shared projectile loop. Both are the personal tuning of a weapon
  // that has not been extracted yet, and EACH ENTRY IS DELETED BY THE WEAPON
  // THAT OWNS IT: when the weapon lands as a module the table moves into it (or
  // becomes a field on the shot), and the entry here goes with it.
  //
  // The list is a RATCHET, not a permission slip:
  //   - anything NOT listed fails, so no new per-weapon table can appear;
  //   - `count` is exact, so a second use of a listed table fails too;
  //   - an entry that is listed but no longer in the source fails as STALE, so
  //     removing the code FORCES removing the entry. That is the only reason a
  //     shrinking list actually shrinks instead of being left behind.
  const INTERIM_EXCEPTIONS: readonly InterimException[] = [
    {
      snippet: 'WEAPON_SHOVE[pr.role]',
      count: 1,
      why: 'per-weapon knockback on a projectile hit (config.ts WEAPON_SHOVE: clap 12)',
      deletedBy:
        'the CLAP module (#141), now the only entry left. Each weapon\'s number is its own ' +
        'tuning; the last one out takes WEAPON_SHOVE and this entry with it. A shove is a ' +
        'shared primitive already — ctx.shove — so a module needs nothing new to keep doing ' +
        'this. Two weapons have already left this way: the snare\'s 8 is SNARE_STATS.shove and ' +
        'the bass\'s 6 is BASS_STATS.shove, each applied from that module\'s own ' +
        'ProjectileBehavior.onHit, which is the slot this lookup occupies. Note the count stays ' +
        '1 — a weapon leaving a shared table shrinks the TABLE, not the number of lookups.',
    },
    {
      snippet: 'SPARK_HIT_ROLES.has(pr.role)',
      count: 1,
      why: 'per-weapon hit spark, view-only (run.ts SPARK_HIT_ROLES: lead)',
      deletedBy:
        'the lead module (#141), now the only entry left. A migrated weapon pushes its own ' +
        'visuals through ctx.fx — which is exactly how the SNARE left this set — so the set ' +
        'and this entry go when lead does.',
    },
  ];

  // ---- source reading -----------------------------------------------------

  /** Blank out comments — and optionally string bodies — character for
   *  character, so every index into the result still lines up with the original
   *  source and a reported line number is the real one. run.ts contains no
   *  regex literals; if one ever appears inside a protected method the brace
   *  matcher below has to learn about it. */
  const mask = (src: string, alsoStrings: boolean): string => {
    const out = src.split('');
    const blank = (from: number, to: number): void => {
      for (let k = from; k < to; k++) if (out[k] !== '\n') out[k] = ' ';
    };
    let i = 0;
    while (i < src.length) {
      const c = src[i];
      if (c === '/' && src[i + 1] === '/') {
        const nl = src.indexOf('\n', i);
        const stop = nl < 0 ? src.length : nl;
        blank(i, stop);
        i = stop;
      } else if (c === '/' && src[i + 1] === '*') {
        const close = src.indexOf('*/', i + 2);
        const stop = close < 0 ? src.length : close + 2;
        blank(i, stop);
        i = stop;
      } else if (c === '"' || c === "'" || c === '`') {
        let j = i + 1;
        while (j < src.length && src[j] !== c) j += src[j] === '\\' ? 2 : 1;
        j = Math.min(j + 1, src.length);
        if (alsoStrings) blank(i + 1, j - 1);
        i = j;
      } else {
        i += 1;
      }
    }
    return out.join('');
  };

  const noComments = mask(source, false);
  const noStrings = mask(noComments, true);

  const lineOf = (index: number): number => {
    let n = 1;
    for (let k = 0; k < index; k++) if (source[k] === '\n') n += 1;
    return n;
  };
  const lineAt = (index: number): string => {
    const from = source.lastIndexOf('\n', index) + 1;
    const to = source.indexOf('\n', index);
    return source.slice(from, to < 0 ? source.length : to).trim();
  };

  /** Locate one RunWorld method BY NAME and return its body's [start, end).
   *
   *  By name, never by "everything between method A and method B": the previous
   *  guard sliced updateProjectiles..spawnZone, so MOVING a method below
   *  spawnZone silently removed it from the scanned region while the guard's
   *  own integrity assert stayed green. A method that cannot be found fails
   *  loudly here — the guard is never allowed to quietly scan nothing. */
  const methodBody = (name: string): { start: number; end: number } => {
    const marker = `\n  private ${name}(`;
    const at = noStrings.indexOf(marker);
    assert(at >= 0,
      `the shared-physics guard cannot find RunWorld.${name} in run.ts. If it was renamed or ` +
      'made non-private, update PROTECTED_METHODS — do not delete the entry. An unfindable ' +
      'protected method means this guard is scanning nothing, which is worse than no guard.');
    assert(noStrings.indexOf(marker, at + 1) < 0,
      `run.ts declares RunWorld.${name} twice; the guard cannot tell which one it protects`);
    let i = at + marker.length - 1;
    let depth = 0;
    for (; i < noStrings.length; i++) {
      if (noStrings[i] === '(') depth += 1;
      else if (noStrings[i] === ')') {
        depth -= 1;
        if (depth === 0) { i += 1; break; }
      }
    }
    const open = noStrings.indexOf('{', i);
    assert(open > 0, `the shared-physics guard cannot find the body of RunWorld.${name}`);
    depth = 0;
    for (i = open; i < noStrings.length; i++) {
      if (noStrings[i] === '{') depth += 1;
      else if (noStrings[i] === '}') {
        depth -= 1;
        if (depth === 0) return { start: open, end: i + 1 };
      }
    }
    throw new Error(`the shared-physics guard cannot find the end of RunWorld.${name}`);
  };

  // ---- the scan -----------------------------------------------------------

  /** Properties that carry a role. `pr.role` on a projectile, `z.source` on a
   *  zone and `wave.source` on a shockwave are the same thing wearing two
   *  names, so both are watched. */
  const ROLE_BEARING = /\.(role|source)\b/g;
  const ROLE_LITERAL = new RegExp(`['"\`](${ROLES.join('|')})['"\`]`, 'g');

  const seen = new Map<string, number>();
  const offenses: string[] = [];

  for (const name of PROTECTED_METHODS) {
    const { start, end } = methodBody(name);
    assert(end - start > 120,
      `RunWorld.${name} came back as an almost-empty body; the guard is misreading run.ts`);

    // Blank every approved form, counting it. What is LEFT is unaccounted for —
    // that inversion is what makes a novel spelling fail by default.
    let region = noStrings.slice(start, end);
    for (const { snippet } of [...GENERIC_ROLE_USE, ...INTERIM_EXCEPTIONS]) {
      let from = 0;
      for (;;) {
        const at = region.indexOf(snippet, from);
        if (at < 0) break;
        region = region.slice(0, at) + ' '.repeat(snippet.length) + region.slice(at + snippet.length);
        from = at + snippet.length;
        seen.set(snippet, (seen.get(snippet) ?? 0) + 1);
      }
    }

    for (const m of region.matchAll(ROLE_BEARING)) {
      offenses.push(`  run.ts:${lineOf(start + m.index)} in ${name}()  ${lineAt(start + m.index)}`);
    }
    // Strings are back for this pass: a role spelled out inside a protected
    // method is a per-weapon branch even when the role never came off a
    // property — `const r = pr.role` gets caught above, `if (r === 'bell')`
    // gets caught here, and either one alone is enough.
    for (const m of noComments.slice(start, end).matchAll(ROLE_LITERAL)) {
      offenses.push(`  run.ts:${lineOf(start + m.index)} in ${name}()  ${lineAt(start + m.index)}`);
    }
  }

  assert.deepEqual(offenses, [],
    'A SHARED PHYSICS LOOP NAMED A WEAPON (#140).\n\n' +
    'The world\'s shared loops — the projectile loop, the arena rails, and the zone, shockwave\n' +
    'and gravity-well loops — own travel, collision and lifetime for EVERY weapon, and they are\n' +
    'not allowed to know which weapon a thing came from. Offending lines:\n\n' +
    offenses.join('\n') +
    '\n\nWhat to do instead, in order of preference:\n' +
    '  1. Motion or hit rules -> the weapon module, lent back through\n' +
    '     ProjectileBehavior.steer / ProjectileBehavior.onHit (see weapons/arp.ts).\n' +
    '  2. Anything else the shot needs -> a FIELD ON THE SHOT, set by its own spawner. That is\n' +
    '     how the evolved lead\'s homing range left this loop: `pr.homingRange = 320` at spawn,\n' +
    '     and the loop just reads a number.\n' +
    '  3. Genuinely generic use of the role (attribution, or the module seam) -> add it to\n' +
    '     GENERIC_ROLE_USE above, but only if it would not grow a case when a tenth weapon\n' +
    '     appears. If it would, it is a branch.\n' +
    '  4. Interim per-weapon tuning that a #141 extraction will take away -> only by an explicit\n' +
    '     entry in INTERIM_EXCEPTIONS naming the weapon that deletes it. That list is supposed\n' +
    '     to shrink to empty; adding to it is a decision, not a workaround.');

  for (const e of INTERIM_EXCEPTIONS) {
    const found = seen.get(e.snippet) ?? 0;
    assert.equal(found, e.count,
      `STALE OR GROWN INTERIM EXCEPTION: \`${e.snippet}\` is listed with count ${e.count} but ` +
      `appears ${found} time(s) in the shared loops.\n` +
      (found === 0
        ? '  It is GONE from the source — which is the good outcome. Delete its entry from\n' +
          '  INTERIM_EXCEPTIONS in systems-check.ts. The list only shrinks because leaving a dead\n' +
          '  entry behind fails here; that is the whole ratchet.\n' +
          `  (It was: ${e.why}, to be removed by ${e.deletedBy})`
        : found > e.count
          ? '  It GREW. A second use of a role-keyed table is a new per-weapon branch in shared\n' +
            '  physics. Move it into the owning weapon module instead of raising the count.'
          : '  Its source text changed (a rename or a reformat), so the guard is no longer\n' +
            '  matching the real line. Update the snippet to the exact new text — the form is\n' +
            '  approved as written, not as a pattern.'));
  }
  for (const g of GENERIC_ROLE_USE) {
    assert((seen.get(g.snippet) ?? 0) >= 1,
      `STALE GENERIC ROLE USE: \`${g.snippet}\` is no longer anywhere in the shared loops.\n` +
      `  It was approved because: ${g.why}\n` +
      '  If the line was legitimately removed, delete this entry. If it was only renamed or\n' +
      '  reformatted, update the snippet to the exact new text — otherwise the guard is quietly\n' +
      '  approving nothing while the real line goes unchecked.');
  }
}

console.log('systems-check: items, note shop, Stage Magnet, enemies, endless director, evolutions, and weapon modules passed');
