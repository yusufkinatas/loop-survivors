import assert from 'node:assert/strict';
import { ACTIVE_ENEMIES, ACTIVE_WEAPONS, FX_FAMILIES, UI_STATES, assertCatalogs } from '../src/dev/catalogs';
import { registeredRooms, roomPath } from '../src/dev/registry';
import '../src/dev/rooms/index';

assertCatalogs();
const rooms = registeredRooms();
assert.ok(rooms.length > 0, 'campus has no rooms');
assert.equal(new Set(rooms.map(roomPath)).size, rooms.length, 'room deep links must be unique');
for (const room of rooms) {
  assert.ok(room.title && room.description, `${room.id} lacks searchable copy`);
  assert.ok(room.tags.length > 0, `${room.id} lacks search tags`);
  const fixture = room.create({ engine: {} as never, kits: new Map() }).defaultFixture;
  assert.ok(fixture.preset, `${room.id} lacks a canonical preset`);
  assert.ok(Number.isSafeInteger(fixture.seed), `${room.id} seed is not reproducible`);
}
assert.equal(ACTIVE_WEAPONS.length, 14);
assert.equal(ACTIVE_ENEMIES.length, 12);
assert.ok(FX_FAMILIES.length > 0 && UI_STATES.length > 0);

console.log(`Dev Campus smoke metadata: ${rooms.length} rooms, ${ACTIVE_WEAPONS.length} weapons, ${ACTIVE_ENEMIES.length} enemies`);
console.log('Automation checks engineering invariants only; no developer gate was evaluated.');
