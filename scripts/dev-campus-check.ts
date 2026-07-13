import assert from 'node:assert/strict';
import { supportedRoles } from '../src/audio/soundset';
import { SIM_DT } from '../src/bot/conductor';
import { ACTIVE_ENEMIES, ACTIVE_WEAPONS, assertCanonicalCatalogs } from '../src/dev/catalog';
import { DEV_ROOMS, assertRoomRegistry, roomPath } from '../src/dev/rooms';
import { SLOTS, slotOf } from '../src/game/band';
import { inspectPickPool, rollOffers } from '../src/game/picks';
import { mulberry32 } from '../src/game/rng';
import { RunWorld } from '../src/game/run';

assertCanonicalCatalogs();
assertRoomRegistry();
assert.equal(DEV_ROOMS.length, 55);
assert.equal(ACTIVE_WEAPONS.length, 14);
assert.equal(ACTIVE_ENEMIES.length, 12);
assert.equal(SLOTS.length, 7);
assert.equal(new Set(DEV_ROOMS.map(roomPath)).size, DEV_ROOMS.length);
assert.equal(new Set(DEV_ROOMS.map((room) => room.issue)).size, DEV_ROOMS.length);

for (const room of DEV_ROOMS) {
  assert.ok(roomPath(room).startsWith(`#dev/${room.kind}/`));
  assert.ok(room.presets.length > 0, `${roomPath(room)} needs a canonical preset`);
  if (room.status === 'PARKED') assert.equal(room.renderer, 'parked');
}

// Seeded offer sequences reproduce exactly and never contain dormant audio.
const offerSequence = (seed: number): string => {
  const rng = mulberry32(seed);
  const tiers = new Map();
  return Array.from({ length: 200 }, () => rollOffers(tiers, rng, 30).map((o) => `${o.role}:${o.tier}`).join('|')).join(',');
};
assert.equal(offerSequence(27), offerSequence(27));
for (let seed = 1; seed <= 200; seed++) {
  const offers = rollOffers(new Map(), mulberry32(seed), 30);
  for (const offer of offers) {
    assert.ok(supportedRoles().includes(offer.role));
    assert.ok(slotOf(offer.role));
    assert.notEqual(offer.role, 'crash');
    assert.notEqual(offer.role, 'riser');
  }
}
const diagnostics = inspectPickPool(new Map(), 30);
assert.equal(diagnostics.filter((item) => item.eligible).length, 14);
assert.equal(diagnostics.find((item) => item.role === 'crash')?.reason, 'dormant audio only');
assert.equal(diagnostics.find((item) => item.role === 'riser')?.reason, 'dormant audio only');

// Hard-reset contract: reconstructing from the same fixture yields an exact
// simulation snapshot after the same fixed ticks.
const simulateFixture = (seed: number): string => {
  const world = new RunWorld(
    { width: 960, height: 600 },
    { onLevelUp() {}, onDeath() {}, onVictory() {}, onHit() {} },
    { rng: mulberry32(seed), scripted: false, fx: false, control: () => ({ x: 1, y: 0 }) },
  );
  world.invincible = true;
  world.addWeapon('kick', 1);
  world.spawnRingOf('zombie', 12);
  for (let tick = 0; tick < 240; tick++) {
    if (tick % 30 === 0) world.fireTrigger({ role: 'kick', time: tick * SIM_DT, velocity: 1, step: tick });
    world.update(SIM_DT);
  }
  return JSON.stringify({
    time: world.timeS,
    player: world.player,
    level: world.level,
    xp: world.xp,
    kills: world.kills,
    tiers: [...world.tiers],
    enemies: world.enemies.map((enemy) => [enemy.id, enemy.kind, enemy.x, enemy.y, enemy.hp, enemy.dead]),
    projectiles: world.projectiles.map((projectile) => [projectile.role, projectile.x, projectile.y]),
    gems: world.gems,
  });
};
assert.equal(simulateFixture(27), simulateFixture(27));
assert.notEqual(simulateFixture(27), simulateFixture(28));

console.log(`Dev Campus smoke passed: ${DEV_ROOMS.length} rooms, ${ACTIVE_WEAPONS.length} active weapons, ${ACTIVE_ENEMIES.length} current enemies.`);
console.log('Automation reports regressions only; no hands, eye, ear, balance, or design gate was passed.');
