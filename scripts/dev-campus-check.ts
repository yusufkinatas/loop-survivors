import assert from 'node:assert/strict';
import { supportedRoles } from '../src/audio/soundset';
import { ROLES } from '../src/audio/kits';
import { SOUNDSET_LADDERS } from '../src/audio/ladders/house';
import { makePolicy } from '../src/bot/policies';
import { SIM_DT } from '../src/bot/conductor';
import {
  ACTIVE_WEAPONS,
  BAND_SLOTS,
  CURRENT_ENEMIES,
  DORMANT_AUDIO,
  EXPERIMENTS,
  FX,
  LEGACY_ENEMIES,
  SOURCES,
  STAGE_ENTRIES,
  SYSTEM_STATUSES,
  UI_STATES,
  validateCanonicalCatalogs,
} from '../src/dev/catalogs';
import {
  applyFixtureValues,
  cloneFixture,
  DEFAULT_FIXTURE,
  parseFixture,
  serializeFixture,
} from '../src/dev/fixture';
import { DisposeBag } from '../src/dev/lifecycle';
import { DEV_ROOMS, roomByIssue } from '../src/dev/registry';
import { ROLE_SLOT, SLOTS } from '../src/game/band';
import {
  CURRENT_ENEMY_KINDS,
  LEGACY_ENEMY_KINDS,
  TIER_LINES,
  WEAPONS,
} from '../src/game/config';
import { STAGE_EVENTS, STAGE_WAVES } from '../src/game/madforest';
import { rollOffers } from '../src/game/picks';
import { mulberry32 } from '../src/game/rng';
import { FX_EVENT_TYPES, RunWorld } from '../src/game/run';

const unique = <T>(values: readonly T[], label: string): void => {
  assert.equal(new Set(values).size, values.length, `${label} contains duplicates`);
};

// Registry and lifecycle contract.
assert.equal(DEV_ROOMS.length, 60);
assert.deepEqual(DEV_ROOMS.map(({ issue }) => issue), Array.from({ length: 60 }, (_, i) => i + 28));
unique(DEV_ROOMS.map(({ slug, kind }) => `${kind}/${slug}`), 'room routes');
for (const room of DEV_ROOMS) {
  assert.ok(room.presets.length > 0, `#${room.issue} has no canonical preset`);
  unique(room.presets.map(({ id }) => id), `#${room.issue} presets`);
  for (const preset of room.presets) {
    const fixture = applyFixtureValues({
      ...DEFAULT_FIXTURE,
      preset: preset.id,
      values: {},
    }, preset.values);
    assert.deepEqual(parseFixture(serializeFixture(fixture), fixture), fixture);
  }
}
assert.equal(roomByIssue(54)?.status, 'PARKED');
assert.equal(roomByIssue(54)?.adapter, 'parked');
assert.equal(roomByIssue(55)?.status, 'PARKED');
assert.equal(roomByIssue(55)?.adapter, 'parked');

const disposal = new DisposeBag();
const disposed: number[] = [];
disposal.add(() => disposed.push(1));
disposal.add(() => disposed.push(2));
await disposal.dispose();
await disposal.dispose();
assert.deepEqual(disposed, [2, 1]);

// Canonical content completeness and status separation.
validateCanonicalCatalogs();
assert.equal(ACTIVE_WEAPONS.length, 14);
assert.equal(BAND_SLOTS.length, 7);
assert.equal(CURRENT_ENEMIES.length, 12);
assert.equal(LEGACY_ENEMIES.length, 8);
assert.deepEqual(DORMANT_AUDIO.map(({ role }) => role), ['crash', 'riser']);
assert.deepEqual(new Set([...supportedRoles(), ...DORMANT_AUDIO.map(({ role }) => role)]), new Set(ROLES));
assert.deepEqual(CURRENT_ENEMIES.map(({ kind }) => kind), [...CURRENT_ENEMY_KINDS]);
assert.deepEqual(LEGACY_ENEMIES.map(({ kind }) => kind), [...LEGACY_ENEMY_KINDS]);
assert.deepEqual(FX.map(({ type }) => type), [...FX_EVENT_TYPES]);
assert.ok(UI_STATES.length >= 14);
assert.ok(EXPERIMENTS.length >= 9);
assert.ok(SYSTEM_STATUSES.some(({ status }) => status === 'REMOVED'));
assert.ok(SYSTEM_STATUSES.some(({ status }) => status === 'PARKED'));
assert.ok(SOURCES.length >= 10);
unique(STAGE_ENTRIES.map(({ id }) => id), 'stage entries');

for (const weapon of ACTIVE_WEAPONS) {
  assert.ok(ROLE_SLOT[weapon.role], `${weapon.role} has no slot`);
  assert.equal(WEAPONS[weapon.role]?.length, 4, `${weapon.role} stats`);
  assert.equal(TIER_LINES[weapon.role]?.length, 4, `${weapon.role} tier copy`);
  assert.equal(SOUNDSET_LADDERS[weapon.role]?.length, 4, `${weapon.role} timing ladder`);
}
for (const { role } of DORMANT_AUDIO) {
  assert.equal(ROLE_SLOT[role], undefined);
  assert.equal(WEAPONS[role], undefined);
  assert.equal(TIER_LINES[role], undefined);
}
assert.deepEqual(SLOTS, BAND_SLOTS.map(({ id }) => id));

const currentKinds = new Set<string>(CURRENT_ENEMY_KINDS);
for (const wave of STAGE_WAVES) {
  for (const kind of wave.pattern) assert.ok(currentKinds.has(kind), `stage wave uses non-current ${kind}`);
}
for (const event of STAGE_EVENTS) {
  if (event.type === 'boss') assert.ok(currentKinds.has(event.kind), `stage boss uses non-current ${event.kind}`);
}

// Seeded offers reproduce exactly and never surface dormant audio.
function offerTrace(seed: number): string[] {
  const rng = mulberry32(seed);
  const tiers = new Map();
  const trace: string[] = [];
  for (let i = 0; i < 30; i++) {
    const offers = rollOffers(tiers, rng, i * 12);
    assert.ok(offers.every(({ role }) => supportedRoles().includes(role)));
    trace.push(offers.map(({ role, tier }) => `${role}:${tier}`).join(','));
    const chosen = offers[0];
    if (chosen) tiers.set(chosen.role, chosen.tier);
  }
  return trace;
}
assert.deepEqual(offerTrace(90210), offerTrace(90210));
assert.throws(() => makePolicy('focus:crash'));
assert.throws(() => makePolicy('focus:riser'));

// Two production worlds with the same fixture remain byte-equivalent through
// fixed ticks. This check never claims a design gate; it only protects replay
// and room-fixture reproducibility.
const noEvents = { onLevelUp() {}, onDeath() {}, onVictory() {}, onHit() {} };
const makeWorld = (seed: number): RunWorld => {
  const world = new RunWorld({ width: 1280, height: 800 }, noEvents, {
    scripted: false,
    rng: mulberry32(seed),
    fx: false,
    control: () => ({ x: Math.SQRT1_2, y: -Math.SQRT1_2 }),
  });
  world.invincible = true;
  world.addWeapon('kick', 2);
  world.spawnRingOf('skeleton', 24);
  return world;
};
const a = makeWorld(424242);
const b = makeWorld(424242);
const trigger = { role: 'kick' as const, time: 0, velocity: 1, step: 0 };
for (let tick = 0; tick < 720; tick++) {
  if (tick % 30 === 0) {
    a.fireTrigger(trigger);
    b.fireTrigger(trigger);
  }
  a.update(SIM_DT);
  b.update(SIM_DT);
}
const snapshot = (world: RunWorld): unknown => ({
  timeS: world.timeS,
  player: world.player,
  level: world.level,
  xp: world.xp,
  kills: world.kills,
  damage: world.damageByRole,
  enemies: world.enemies.map(({ id, kind, x, y, hp, dead, knockT }) => ({ id, kind, x, y, hp, dead, knockT })),
  projectiles: world.projectiles.map(({ role, x, y, lifeS, pierce }) => ({ role, x, y, lifeS, pierce })),
  zones: world.zones.map(({ source, x, y, lifeS }) => ({ source, x, y, lifeS })),
  gems: world.gems,
});
assert.deepEqual(snapshot(a), snapshot(b));

console.log('Dev Campus engineering checks passed. No developer judgment gate was evaluated.');
