import assert from 'node:assert/strict';
import {
  ENEMIES,
  MAX_ALIVE_HARD,
  RUN,
  WEAPONS,
  madForestEnemyStats,
  xpPickupMultiplier,
  xpForNextLevel,
} from '../src/game/config';
import { STAGE_EVENTS, STAGE_STARTING_SPAWNS, STAGE_WAVES } from '../src/game/madforest';
import { circleIntersectsRect } from '../src/game/run';

const close = (actual: number, expected: number, epsilon = 1e-9): void => {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);
};

// Current Normal Mad Forest, live official-wiki revision 89346.
assert.equal(STAGE_STARTING_SPAWNS, 10);
assert.deepEqual(
  STAGE_WAVES.map((w) => [w.atS, [...w.pattern], w.minimum, w.intervalS]),
  [
    [0, ['redBat2'], 15, 1],
    [60, ['zombie', 'bat'], 30, 1],
    [120, ['bat', 'redBat', 'redBat2'], 50, 0.5],
    [180, ['skeleton'], 40, 0.25],
    [240, ['skeleton', 'ghost'], 30, 1],
    [300, ['greenMudman'], 10, 1],
    [360, ['zombie', 'greenMudman'], 20, 0.5],
    [420, ['redBat', 'redBat2', 'grayMudman'], 80, 0.5],
  ],
);
assert.equal(STAGE_EVENTS.filter((e) => e.type === 'boss').length, 4);
assert.deepEqual(
  STAGE_EVENTS.filter((e) => e.type === 'boss').map((e) => [e.atS, e.rewardChance]),
  [[60, 0.3], [180, 0.43], [300, 1], [420, 0.5635]],
);
assert.equal(STAGE_EVENTS.filter((e) => e.type === 'flowerWall').length, 1);
assert.deepEqual(
  STAGE_EVENTS.filter((e) => e.type === 'batSweep').map((e) => [e.atS, e.chance]),
  [
    [125, 1], [130, 1], [135, 1],
    [185, 0.1], [190, 0.1],
    [245, 0.1], [250, 0.1],
    [365, 0.1], [370, 0.1],
    [425, 0.8], [430, 0.8], [435, 0.8], [440, 0.8], [445, 0.8], [450, 0.8],
  ],
);
assert.equal(ENEMIES.maxAlive, 300);
assert.equal(MAX_ALIVE_HARD, 500);

// Antonio and bestiary values, including map movement multipliers.
assert.deepEqual(
  [RUN.playerHp, RUN.playerArmor, RUN.playerSpeed, RUN.iframesS],
  [120, 1, 159, 0.12],
);
close(ENEMIES.zombie.speed / RUN.playerSpeed, 0.28, 0.001);
close(ENEMIES.bat.speed / RUN.playerSpeed, 0.392, 0.001);
close(ENEMIES.batSwarm.speed / RUN.playerSpeed, 1.96, 0.003);
assert.deepEqual(
  [ENEMIES.bat.hp, ENEMIES.bat.damage, ENEMIES.zombie.hp, ENEMIES.zombie.damage],
  [1, 4, 10, 9],
);
assert.equal(madForestEnemyStats('glowingBat', 7).hp, 350);
assert.equal(madForestEnemyStats('flower', 7).hp, 210);
assert.equal(madForestEnemyStats('mantis', 7).hp, 500);
assert.equal(madForestEnemyStats('mantis', 7).xp, 3);

// Exact next-level XP formula and cumulative published checkpoints.
assert.deepEqual(
  [1, 2, 19, 20, 21, 39, 40, 41].map(xpForNextLevel),
  [5, 15, 185, 795, 208, 442, 2855, 471],
);
const cumulativeTo = (level: number): number => {
  let xp = 0;
  for (let current = 1; current < level; current++) xp += xpForNextLevel(current);
  return xp;
};
assert.equal(cumulativeTo(20), 1805);
assert.equal(cumulativeTo(21), 2600);
assert.equal(cumulativeTo(40), 8775);
assert.equal(cumulativeTo(41), 11630);
assert.deepEqual([19, 20, 21, 39, 40, 41].map(xpPickupMultiplier), [1, 2, 1, 1, 2, 1]);

// Kick tiers map to Whip L1/L3/L5/L8; Area 1's normalized rectangle spans
// x=-17..241 when facing right from x=0.
assert.deepEqual(
  WEAPONS.kick.map((w) => [w.damage, w.area, w.amount]),
  [[10, 1, 1], [15, 1, 2], [25, 1.1, 2], [40, 1.2, 2]],
);
assert.equal(circleIntersectsRect(241, -28, 0, 112, -28, 129, 19.5), true);
assert.equal(circleIntersectsRect(241.01, -28, 0, 112, -28, 129, 19.5), false);
assert.equal(circleIntersectsRect(-17, -28, 0, 112, -28, 129, 19.5), true);
assert.equal(circleIntersectsRect(0, 0, 16, 112, -28, 129, 19.5), true);

console.log('Mad Forest parity checks passed.');
