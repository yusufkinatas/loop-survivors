// Focused dependency-free checks for the dedicated opening-weapon domain.
// Run with: node --import tsx src/game/starting-weapons-check.ts

import assert from 'node:assert/strict';
import { soundsetSupports, supportedRoles } from '../audio/soundset';
import type { Role } from '../audio/kits';
import { groundPickPosition, LEVELUP } from './config';
import { RunWorld, type RunEvents } from './run';
import {
  chooseStartingWeapon,
  createStartingWeaponSelection,
  rollStartingWeapons,
} from './starting-weapons';

const live = supportedRoles();
assert(live.length >= 4, 'fixture requires the shipped soundset weapon catalog');

const many = rollStartingWeapons(live, () => 0.5);
assert.equal(many.length, 3);
assert.equal(new Set(many).size, 3, 'three opening offers must be distinct');
assert(many.every((role) => live.includes(role) && soundsetSupports(role)));

const two = rollStartingWeapons(live.slice(0, 2), () => 0.25);
assert.equal(two.length, 2, 'a two-weapon catalog should offer both without crashing');
assert.equal(new Set(two).size, 2);

const one = rollStartingWeapons(live.slice(0, 1), () => 0.75);
assert.deepEqual(one, [live[0]], 'a one-weapon catalog should offer its sole weapon');

const fallback = rollStartingWeapons([], () => Number.NaN);
assert.equal(fallback.length, 1, 'an empty/corrupt unlock set needs one safe fallback');
assert(soundsetSupports(fallback[0]), 'the fallback must be voiced by the current soundset');

const selection = createStartingWeaponSelection(live.slice(0, 4), () => 0.4);
const chosenRole = selection.offered[1];
const chosen = chooseStartingWeapon(selection, chosenRole);
assert(chosen);
assert.equal(chosen.selected, chosenRole);
assert.deepEqual(chosen.offered, [], 'selecting one weapon must remove every other opening choice');
assert.equal(chooseStartingWeapon(selection, 'tom'), null,
  'a role outside the offered selection must not resolve it');
assert.equal(chooseStartingWeapon(chosen, chosenRole), null,
  'an already-resolved selection must ignore duplicate collection');

// A short landscape view clamps both axes while keeping every choice outside
// the fixed collection radius. This covers the opening shell's label-safe
// placement instead of testing only the standard 1280×720 fixture.
for (const degrees of LEVELUP.angles) {
  const pick = groundPickPosition(0, 0, degrees, 320, 240);
  assert(Math.abs(pick.x) <= 68 + Number.EPSILON);
  assert(Math.abs(pick.y) <= 44 + Number.EPSILON);
  assert(Math.hypot(pick.x, pick.y) > LEVELUP.itemPickupRadius);
}

const events: RunEvents = {
  onLevelUp: () => assert.fail('the opening gate must not grant a level'),
  onDeath: () => assert.fail('the frozen opening must not deal damage'),
  onVictory: () => undefined,
  onHit: () => assert.fail('the frozen opening must not register hits'),
};
const opening = new RunWorld(
  { width: 1280, height: 720 },
  events,
  {
    awaitingStartingWeapon: true,
    control: () => ({ x: 1, y: 0 }),
    fx: false,
    rng: () => 0.5,
  },
);
opening.invincible = true;
opening.player.iframesT = 1;
const frozenEnemy = opening.spawnEnemyAt('bat', 260, 0)!;
const frozenEnemyX = frozenEnemy.x;
opening.update(0.5);
assert(opening.player.x > 0, 'the player must be able to walk onto an opening choice');
assert.equal(opening.timeS, 0, 'run time must stay frozen during opening selection');
assert.equal(opening.level, 1);
assert.equal(opening.xp, 0);
assert.equal(opening.player.iframesT, 1, 'non-movement timers must stay frozen');
assert.equal(frozenEnemy.x, frozenEnemyX, 'existing enemies must not move while the gate is closed');
assert.equal(opening.beginCombat(), false, 'combat must refuse to start without a weapon');
assert.equal(opening.awaitingStartingWeapon, true);

const role = fallback[0] as Role;
opening.addWeapon(role, 1);
assert.equal(opening.level, 1, 'installing a starting weapon must not grant a level');
assert.equal(opening.xp, 0, 'installing a starting weapon must not grant XP');
assert.equal(opening.beginCombat(), true);
assert.equal(opening.awaitingStartingWeapon, false);
opening.update(0.01);
assert.equal(opening.timeS, 0.01, 'normal run time should begin only after weapon selection');
assert(opening.enemyCount > 1, 'the scripted director should begin after the opening gate releases');

const defaultFixture = new RunWorld(
  { width: 1280, height: 720 },
  events,
  { scripted: false, fx: false },
);
assert.equal(defaultFixture.beginCombat(), false,
  'beginCombat must refuse a weaponless world even when its default fixture gate is open');
defaultFixture.update(0.25);
assert.equal(defaultFixture.timeS, 0.25,
  'sandbox and existing test worlds must remain active unless they opt into the gate');

console.log('starting-weapons-check: selection and pre-combat gate passed');
