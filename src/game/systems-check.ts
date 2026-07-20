// Dependency-free integration checks for the endless-run systems. Run with
// `npm run verify`; failures throw and produce a non-zero exit.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
import { ALL_ENEMY_KINDS, ENEMY_LABELS, RUN, SHOVE_S, STAGE_MAGNET, TIER_LINES, WEAPONS, type EnemyKind } from './config';
import { rollOffers } from './picks';
import { mulberry32 } from './rng';
import { KIT_COLORS, RunWorld, type FxEvent, type Projectile, type RunEvents } from './run';
import {
  ARP,
  KICK,
  WEAPON_MODULES,
  buildsAsProjectile,
  weaponTiers,
  type WeaponContext,
  type WeaponInstance,
  type WeaponTarget,
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
assert.equal(buildsAsProjectile('kick'), false,
  'the kick must stay outside projectileDamageMul, as applyBuild had it');
assert.equal(buildsAsProjectile('arp'), true,
  'the arp was in the world legacy projectile-role set and must keep that answer');
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
}

function fakeTarget(x: number, y: number, over: Partial<FakeTarget> = {}): FakeTarget {
  return {
    x, y, radius: 12, dead: false, speed: 60, knockbackMul: 1,
    lastMoveX: 0, lastMoveY: 0, hp: 1e6, ...over,
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
  near(x: number, y: number, r: number): readonly WeaponTarget[] {
    return this.targets.filter((t) => Math.hypot(t.x - x, t.y - y) <= r + t.radius);
  }
  all(): readonly WeaponTarget[] { return this.targets; }
  damage(t: WeaponTarget, amount: number): void {
    const f = t as FakeTarget;
    this.hits.push({ t: f, amount });
    this.seq.push('damage');
    f.hp -= amount;
    if (f.hp <= 0) f.dead = true;
  }
  shove(_t: WeaponTarget, _x: number, _y: number, d: number): void { this.knocks.push(`shove:${d}`); }
  setKnock(_t: WeaponTarget, vx: number, vy: number, s: number): void {
    this.knocks.push(`knock:${vx},${vy},${s}`);
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

  // Identity, not tuning, but equally load-bearing: buildsAsProjectile false is
  // what keeps Needle Tips' projectileDamageMul off the kick, and tickAt is the
  // phase name the world's tick call site has to match.
  assert.equal(KICK.stats.buildsAsProjectile, false, 'the kick must not build as a projectile');
  assert.equal(buildsAsProjectile('kick'), false);
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

  assert.equal(ARP.stats.buildsAsProjectile, true, 'the arp builds as a projectile');
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

  // THE PIERCE EXEMPTION, measured through the real loop (ADR-0002). Twelve
  // enemies parked on the ring and ONE orbiter that has to sweep all of them.
  // maxPierce on an orbiter is 1, so a shared `pr.pierce -= 1` reaching it kills
  // it on its first touch and this comes out at exactly 3.
  const ring = Array.from({ length: 12 }, (_, i) => {
    const a = (Math.PI * 2 * i) / 12;
    return [122 * Math.cos(a), 122 * Math.sin(a)] as const;
  });
  const sweep = worldStrike({ role: 'arp', tier: 4, offsets: ring, frozen: true, frames: 200 });
  assert(sweep.damageDealt >= 12 * 3,
    'one orbiter must sweep a whole ring: it chips on a timer and never spends pierce ' +
    '(ADR-0002). Exactly 3 here means the shared pierce rule consumed it on its first hit');
  assert.equal(sweep.world.projectiles.filter((pr) => pr.role === 'arp').length, 0,
    'the orbiter still dies of old age, like every other projectile');
}

// ---------------------------------------------------------------------------
// THE RULE #140 EXISTS TO ESTABLISH: the shared projectile physics has ZERO
// per-weapon branches, permanently.
//
// This is the one invariant seven more extractions depend on, and it is exactly
// the kind of rule that decays the moment it is only written down. Weapon eight
// will have some motion that "just needs one small branch here", and a code
// review is a bad place to catch it. So: read the source of the shared loop and
// the arena rails, and fail if a role comparison ever reappears in either.
//
// Weapon-specific motion belongs to the owning weapon module, lent back through
// ProjectileBehavior. Anything else a shot needs is a FIELD ON THE SHOT, set by
// whatever spawned it — that is how the arp's orbit and the evolved lead's
// homing range both left this loop.
//
// SPAWNERS ARE NOT COVERED and deliberately so: baseProjectile and
// spawnProjectile still branch on role for the four unmigrated projectile
// weapons, and each of those branches leaves with its own weapon's module.
// ---------------------------------------------------------------------------
{
  const source = readFileSync(new URL('./run.ts', import.meta.url), 'utf8');
  const start = source.indexOf('  private updateProjectiles(');
  const end = source.indexOf('  private spawnZone(');
  assert(start > 0 && end > start,
    'the shared-loop guard cannot find updateProjectiles..spawnZone in run.ts — fix the guard, ' +
    'do not delete it');
  const sharedPhysics = source
    .slice(start, end)
    // Comments talk ABOUT the branches that used to be here; only code counts.
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
  const offenders = sharedPhysics.match(/\.role\s*[=!]==/g) ?? [];
  assert.deepEqual(offenders, [],
    'the shared projectile loop and the arena rails must contain NO per-weapon branch (#140). ' +
    "Found a `.role ===` comparison. Weapon-specific motion belongs to the weapon module, " +
    'lent back through ProjectileBehavior.steer/onHit; anything else belongs on the projectile ' +
    'as a field set at spawn.');
}

console.log('systems-check: items, note shop, Stage Magnet, enemies, endless director, evolutions, and weapon modules passed');
