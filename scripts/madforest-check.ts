import assert from 'node:assert/strict';
import { chartEventsAtStep } from '../src/audio/arranger';
import { Clock } from '../src/audio/clock';
import { SOUNDSET_LADDERS } from '../src/audio/ladders/house';
import { STEPS_PER_PHRASE } from '../src/audio/scale';
import {
  BAT_SWARM_RADII,
  ENEMIES,
  MAX_ALIVE_HARD,
  MAD_FOREST_FRAMES,
  RUN,
  WEAPONS,
  legacyEnemyRadius,
  madForestEnemyStats,
  xpPickupMultiplier,
  xpForNextLevel,
} from '../src/game/config';
import { STAGE_EVENTS, STAGE_STARTING_SPAWNS, STAGE_WAVES } from '../src/game/madforest';
import {
  KICK_GEOMETRY,
  PLAYER_FOOT_OFFSET,
  RunWorld,
  circleIntersectsRect,
  kickStripCenter,
} from '../src/game/run';

const close = (actual: number, expected: number, epsilon = 1e-9): void => {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);
};
const noEvents = { onLevelUp() {}, onDeath() {}, onVictory() {}, onHit() {} };

// Pausing a lookahead clock must preserve its next unscheduled time; reward
// tail cancellation explicitly rewinds the first unheard step instead.
const scheduledSteps: Array<[number, number]> = [];
const fakeAudioTime = 10;
const originalWindow = globalThis.window;
Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: {
    setInterval: () => 1,
    clearInterval: () => {},
  },
});
const fakeClock = new Clock(
  { get currentTime() { return fakeAudioTime; } } as AudioContext,
  122,
  4,
  (step, time) => scheduledSteps.push([step, time]),
);
fakeClock.start();
assert.equal(scheduledSteps.length, 1);
fakeClock.pause();
fakeClock.resume();
assert.equal(scheduledSteps.length, 1);
fakeClock.pause();
fakeClock.rewindToStep(1, fakeAudioTime + 0.1);
fakeClock.resume();
assert.deepEqual(scheduledSteps.map(([step]) => step), [0, 1]);
fakeClock.stop();
Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow });

// Current Normal Mad Forest, live official-wiki revision 89346.
// The current game deliberately opens at triple the reference population.
assert.equal(STAGE_STARTING_SPAWNS, 30);
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
assert.deepEqual([RUN.playerHp, RUN.playerArmor, RUN.iframesS], [120, 1, 0.12]);
close(RUN.playerSpeed, 82.5 * 1.1 * (800 / 456));
close(RUN.playerRadius, 9 * (800 / 456));
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

// Legacy circular bodies: Phaser floors the requested 40%-of-frame radius at
// H456 before H800 normalization. Variants cycle without perturbing stage RNG.
for (const [kind, frames] of Object.entries(MAD_FOREST_FRAMES)) {
  assert.ok(frames && frames.length > 0, `${kind} has no source frames`);
}
close(ENEMIES.bat.radius, legacyEnemyRadius(19));
close(ENEMIES.redBat.radius, legacyEnemyRadius(25));
close(ENEMIES.redBat2.radius, legacyEnemyRadius(30));
close(ENEMIES.zombie.radius, legacyEnemyRadius(31));
close(ENEMIES.glowingBat.radius, legacyEnemyRadius(27));
close(ENEMIES.mantis.radius, legacyEnemyRadius(48));
assert.deepEqual(BAT_SWARM_RADII, [19, 25, 30].map(legacyEnemyRadius));
const bodyVariants = new RunWorld({ width: 1280, height: 800 }, noEvents, {
  scripted: false,
  fx: false,
});
for (let i = 0; i < 6; i++) bodyVariants.spawnEnemy('skeleton');
assert.deepEqual(
  bodyVariants.enemies.map((e) => e.radius),
  [28, 32, 32, 34, 32, 34].map(legacyEnemyRadius),
);
const skeletonFootOffsets = [
  [-2.6, 16.4],
  [-2.4, 14.6],
  [-2.4, 14.6],
  [-2.8, 13.2],
  [-2.4, 14.6],
  [-2.8, 13.2],
];
for (const [i, e] of bodyVariants.enemies.entries()) {
  close(e.footOffsetX, skeletonFootOffsets[i][0] * (800 / 456));
  close(e.footOffsetY, skeletonFootOffsets[i][1] * (800 / 456));
}
const anchored = new RunWorld({ width: 1280, height: 800 }, noEvents, {
  scripted: false,
  fx: false,
});
anchored.spawnEnemy('zombie', 0);
const anchoredZombie = anchored.enemies[0];
close(anchoredZombie.y + anchoredZombie.footOffsetY, PLAYER_FOOT_OFFSET.y);
const anchorYBefore = anchoredZombie.y;
anchored.update(1 / 60);
close(anchoredZombie.y, anchorYBefore);

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

// Kick tiers map to Whip L1/L3/L5/L8. Geometry is converted from the source
// feet anchor to this world's collision-center coordinate.
assert.deepEqual(
  WEAPONS.kick.map((w) => [w.damage, w.area, w.amount]),
  [[10, 1, 1], [15, 1, 2], [25, 1.1, 2], [40, 1.2, 2]],
);
const kickCenter = kickStripCenter(0, 0, 1, 0);
const kickHalfW = KICK_GEOMETRY.baseWidth / 2;
const kickHalfH = KICK_GEOMETRY.baseHeight / 2;
close(kickCenter.x, (65 * 800) / 456);
close(kickCenter.y, (-9 * 800) / 456);
assert.equal(circleIntersectsRect(kickCenter.x + kickHalfW, kickCenter.y, 0, kickCenter.x, kickCenter.y, kickHalfW, kickHalfH), true);
assert.equal(circleIntersectsRect(kickCenter.x + kickHalfW + 0.01, kickCenter.y, 0, kickCenter.x, kickCenter.y, kickHalfW, kickHalfH), false);
assert.equal(
  circleIntersectsRect(0, 0, RUN.playerRadius, kickCenter.x, kickCenter.y, kickHalfW, kickHalfH),
  true,
);

// Every Kick tier is exactly four-on-the-floor: 16 attacks per four-bar
// phrase, never hidden ghost triggers between the beats.
for (const chart of SOUNDSET_LADDERS.kick!) {
  const fired: number[] = [];
  for (let step = 0; step < STEPS_PER_PHRASE; step++) {
    if (chartEventsAtStep(chart, step).length > 0) fired.push(step);
  }
  assert.deepEqual(fired, [0, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60]);
}

const trigger = { role: 'kick' as const, time: 0, velocity: 1, step: 0 };

// The current pressure pass starts at thirty; the first wave callback does not
// remove enemies merely because its reference minimum is lower.
const opening = new RunWorld({ width: 1920, height: 1080 }, noEvents, {
  control: () => ({ x: 0, y: 0 }),
  fx: false,
});
opening.invincible = true;
opening.update(1 / 60);
assert.equal(opening.enemies.length, 30);
assert.equal(opening.worldH, 800);
for (let i = 1; i < 60; i++) opening.update(1 / 60);
assert.equal(opening.enemies.length, 30);

// A Whip body remains damaging for 200ms, so an enemy entering after the
// activation frame is still hit. The Amount-2 follow-up starts a true 100ms
// later and is 28 H800 pixels above the first strip.
const active = new RunWorld({ width: 1280, height: 800 }, noEvents, { scripted: false, fx: true });
active.addWeapon('kick', 2);
active.spawnEnemy('bat');
const entrant = active.enemies[0];
entrant.x = 500;
entrant.y = -28;
active.fireTrigger(trigger);
active.update(1 / 60);
assert.equal(entrant.dead, false);
entrant.x = 100;
active.update(1 / 60);
assert.equal(entrant.dead, true);
const mainFx = active.fx!.filter((fx) => fx.type === 'whip');
assert.equal(mainFx.length, 1);
for (let i = 0; i < 4; i++) active.update(1 / 60);
assert.equal(active.fx!.filter((fx) => fx.type === 'whip').length, 1);
active.update(1 / 60);
const whipFx = active.fx!.filter((fx) => fx.type === 'whip');
assert.equal(whipFx.length, 2);
close(whipFx[1].y, (-25 * 800) / 456);

// The body scales with the slash: an outer-edge target is still outside at
// 50 ms, then enters when the strip reaches full Area at 100 ms.
const ramp = new RunWorld({ width: 1280, height: 800 }, noEvents, { scripted: false, fx: false });
ramp.addWeapon('kick', 1);
ramp.spawnEnemy('bat');
const outer = ramp.enemies[0];
outer.speed = 0;
outer.x = kickCenter.x + kickHalfW - outer.radius * 0.75;
outer.y = kickCenter.y;
ramp.fireTrigger(trigger);
for (let i = 0; i < 4; i++) ramp.update(1 / 60);
assert.equal(outer.dead, false);
for (let i = 0; i < 3; i++) ramp.update(1 / 60);
assert.equal(outer.dead, true);

console.log('Mad Forest parity checks passed.');
