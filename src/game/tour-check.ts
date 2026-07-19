// Standalone deterministic checks for the pure tour helpers.
// Run with: node --import tsx src/game/tour-check.ts

import {
  CORE_VENUE_IDS,
  ENDLESS_WAVE_ROWS,
  NEON_RAIL_BUILD_CONFIG,
  PRESSURE_BREAK_CONFIG,
  VENUE_IDS,
  VENUES,
  addPressureCloseKill,
  applyPressureHit,
  beginPressureDrop,
  buildNeonLoopRail,
  createNeonLoopSamples,
  createPressureBreakState,
  crossedGateNumbers,
  endlessScale,
  firstRailIntersection,
  gateOptions,
  gateSelectionTiming,
  gateWindow,
  intersectAndReflect,
  neonLoopCrossesItself,
  pressureHeatRate,
  pressureRadius,
  resolveGateChoice,
  sampleNeonLoopPoint,
  segmentIntersection,
  simplifyNeonLoop,
  updatePressureBreak,
  waveRecipe,
  type Point2,
  type Segment2,
} from './tour';

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`tour check failed: ${message}`);
}

function near(actual: number, expected: number, epsilon = 1e-6): void {
  check(Math.abs(actual - expected) <= epsilon, `${actual} should be near ${expected}`);
}

function same(actual: unknown, expected: unknown, message: string): void {
  check(JSON.stringify(actual) === JSON.stringify(expected), message);
}

export function runTourChecks(): void {
  same(
    VENUE_IDS,
    ['alley', 'warehouse', 'rooftop', 'metro', 'basement', 'dawn'],
    'venue ids must stay stable for saves',
  );
  check(Object.isFrozen(VENUES) && Object.isFrozen(VENUES.alley), 'venue registry is mutable');
  check(VENUES.alley.mechanic.kind === 'alley-bounce', 'alley mechanic drifted');
  check(VENUES.alley.mechanic.enemySpeedMul === 1.12, 'alley danger drifted');
  check(VENUES.metro.mechanic.kind === 'metro-train', 'metro mechanic drifted');
  check(VENUES.metro.mechanic.laneIntervalS === 40, 'train cadence drifted');
  check(VENUES.dawn.mechanic.kind === 'dawn-light', 'dawn mechanic drifted');
  check(VENUES.dawn.mechanic.contactDamageMul === 1.25, 'dawn danger drifted');

  const firstOptions = gateOptions('night-17', 1, 'alley', ['alley']);
  same(
    firstOptions.map((option) => option.venueId).sort(),
    ['rooftop', 'warehouse'],
    'gate one must expose both core branches',
  );
  same(firstOptions, gateOptions('night-17', 1, 'alley', ['alley']), 'gate RNG drifted');
  const coreOnly = gateOptions(
    'night-17',
    2,
    'warehouse',
    ['alley', 'warehouse'],
    2,
    CORE_VENUE_IDS,
  );
  check(
    coreOnly.every((option) => CORE_VENUE_IDS.includes(option.venueId)),
    'a meta-locked venue leaked into core options',
  );
  const metroUnlocked = gateOptions(
    'night-17',
    2,
    'warehouse',
    ['alley', 'warehouse'],
    2,
    [...CORE_VENUE_IDS, 'metro'],
  );
  check(metroUnlocked.some((option) => option.venueId === 'metro'), 'new venue lost novelty priority');
  check(gateSelectionTiming(279.9, 1).phase === 'before', 'gate opened early');
  check(gateSelectionTiming(280, 1).phase === 'open', 'gate did not open at 4:40');
  check(gateSelectionTiming(298, 1).phase === 'expired', '4:58 fallback is not exclusive');
  same(crossedGateNumbers(279, 901), [1, 2, 3], 'large frame dropped a gate');
  near(gateWindow(2).opensAtS, 580);
  near(gateWindow(2).transitionsAtS, 600);
  check(
    resolveGateChoice(firstOptions, firstOptions[0].venueId, 600, gateWindow(2)) === null,
    'stale gate options resolved against a later window',
  );

  const scale8 = endlessScale(8);
  near(scale8.hp, 1.08 ** 8);
  near(scale8.damage, 1.025 ** 8);
  near(scale8.speed, 1.06);
  near(scale8.xp, 1.12);
  near(scale8.boss, 1.4);
  near(scale8.ampedChance, -0.045);
  near(endlessScale(12).ampedChance, 0.015);
  near(endlessScale(30).ampedChance, 0.18);
  near(endlessScale(100).speed, 1.3);
  check(
    Object.isFrozen(ENDLESS_WAVE_ROWS) &&
      Object.isFrozen(ENDLESS_WAVE_ROWS[0]) &&
      Object.isFrozen(ENDLESS_WAVE_ROWS[0].pattern),
    'authored endless rows are mutable',
  );

  same(waveRecipe(8).pattern, ['skeleton', 'charger'], 'minute-eight row drifted');
  same(
    waveRecipe(9).pattern,
    ['ghost', 'circler', 'zombie'],
    'minute-nine row drifted',
  );
  same(
    waveRecipe(14).pattern,
    ['splitter', 'circler', 'shielded'],
    'minute-fourteen row drifted',
  );
  same(
    waveRecipe(15).pattern,
    ['skeleton', 'charger', 'ghost', 'circler', 'zombie'],
    'minute-fifteen adjacent-row recipe drifted',
  );
  check(waveRecipe(8).floor === 244, 'minute-eight floor drifted');
  check(waveRecipe(30).floor === 360, 'wave floor cap drifted');
  near(waveRecipe(8).intervalS, 0.55);
  near(waveRecipe(500).intervalS, 0.22);
  check(waveRecipe(10).headlinerCount === 1, 'minute-ten headliner count drifted');
  check(waveRecipe(15).headlinerCount === 2, 'minute-fifteen headliner count drifted');
  check(waveRecipe(45).headlinerCount === 4, 'headliner count cap drifted');
  check(waveRecipe(11).headlinerCount === 0, 'headliner spawned off its five-minute mark');

  const straight = simplifyNeonLoop([
    { x: 0, y: 0 },
    { x: 5, y: 1 },
    { x: 10, y: -1 },
    { x: 15, y: 0 },
  ]);
  check(straight.length === 2, 'RDP did not remove sub-six-unit noise');
  const corner = simplifyNeonLoop([
    { x: 0, y: 0 },
    { x: 10, y: 8 },
    { x: 20, y: 0 },
  ]);
  check(corner.length === 3, 'RDP removed a point beyond tolerance six');

  let samples = createNeonLoopSamples({ x: 0, y: 0 });
  const early = sampleNeonLoopPoint(samples, { x: 20, y: 0 }, 0.05);
  check(early === samples, 'Neon recorder sampled before 0.1 seconds');
  samples = sampleNeonLoopPoint(samples, { x: 20, y: 0 }, 0.1);
  check(samples.points.length === 2, 'Neon recorder missed its 0.1-second sample');
  samples = createNeonLoopSamples({ x: 0, y: 0 });
  for (let i = 1; i <= 12; i++) {
    samples = sampleNeonLoopPoint(samples, { x: i * 10, y: 0 }, i * 0.11, {
      minDistance: 1,
      sampleIntervalS: 0.1,
      maxPoints: 5,
    });
  }
  check(samples.points.length === 5, 'Neon recorder exceeded its point bound');

  const square = buildNeonLoopRail([
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ]);
  check(square.kind === 'loop' && !square.closed && square.segments.length === 3, 'open square rail failed');
  const fallback = buildNeonLoopRail([{ x: 0, y: 0 }, { x: 10, y: 0 }]);
  check(fallback.kind === 'fallback' && fallback.segments.length === 1, 'fallback rail failed');
  near(fallback.length, 120);
  const noisyCircle: Point2[] = [];
  for (let i = 0; i < 120; i++) {
    const angle = (i / 120) * Math.PI * 2;
    const radius = i % 2 === 0 ? 100 : 75;
    noisyCircle.push({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
  }
  const capped = buildNeonLoopRail(noisyCircle, { x: 0, y: 0 }, { x: 1, y: 0 }, {
    ...NEON_RAIL_BUILD_CONFIG,
    tolerance: 0,
    minLoopLength: 0,
  });
  check(capped.segments.length <= 48, 'Neon rail exceeded 48 segments');
  check(
    neonLoopCrossesItself([
      { x: 0, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
      { x: 100, y: 0 },
    ]),
    'Neon self-crossing milestone geometry failed',
  );

  const movement: Segment2 = { a: { x: 0, y: 0 }, b: { x: 10, y: 0 } };
  const vertical: Segment2 = { a: { x: 5, y: -5 }, b: { x: 5, y: 5 } };
  const hit = segmentIntersection(movement, vertical);
  check(hit !== null, 'crossing segments did not intersect');
  near(hit.t, 0.5);
  near(hit.point.x, 5);
  const reflected = intersectAndReflect(movement, { x: 10, y: 0 }, [vertical]);
  check(reflected !== null, 'rail reflection missed the intersection');
  near(reflected.reflectedVelocity.x, -10);
  near(reflected.remainingEnd.x, 0, 0.001);
  const diagonal: Segment2 = { a: { x: -1, y: -1 }, b: { x: 1, y: 1 } };
  const horizontal: Segment2 = { a: { x: -2, y: 0 }, b: { x: 2, y: 0 } };
  const cornerA = firstRailIntersection(diagonal, [vertical, horizontal]);
  const cornerB = firstRailIntersection(diagonal, [horizontal, vertical]);
  check(cornerA !== null && cornerB !== null, 'corner intersection failed');
  near(cornerA.normal.x, cornerB.normal.x);
  near(cornerA.normal.y, cornerB.normal.y);

  near(pressureRadius(9), 139);
  near(pressureHeatRate(0), -3);
  near(pressureHeatRate(1), 0.45);
  near(pressureHeatRate(20), 6);
  let pressure = updatePressureBreak(createPressureBreakState(), {
    dtS: 10,
    closeEnemyCount: 10,
  });
  near(pressure.state.heat, 45);
  pressure = { ...pressure, state: addPressureCloseKill(pressure.state) };
  near(pressure.state.heat, 47);
  pressure = { ...pressure, state: applyPressureHit(pressure.state) };
  near(pressure.state.heat, 17);
  pressure = updatePressureBreak(pressure.state, { dtS: 20, closeEnemyCount: 20 });
  near(pressure.state.heat, 100);
  check(pressure.state.phase === 'armed' && pressure.state.armPending, 'full heat did not queue');
  const hitWhileArmed = applyPressureHit(pressure.state);
  check(hitWhileArmed === pressure.state, 'a hit changed an earned Drop');
  near(hitWhileArmed.heat, 100);

  const manualDrop = beginPressureDrop(pressure.state, 7);
  check(manualDrop.state.phase === 'drop', 'manual phrase-boundary start failed');
  same(manualDrop.events, ['drop-started'], 'Drop start event drifted');
  check(manualDrop.isDropActive, 'Drop did not become active immediately');
  near(manualDrop.damageMul, PRESSURE_BREAK_CONFIG.dropDamageMul);
  near(manualDrop.areaMul, PRESSURE_BREAK_CONFIG.dropAreaMul);
  near(manualDrop.projectileSpeedMul, PRESSURE_BREAK_CONFIG.dropProjectileSpeedMul);
  near(manualDrop.moveMul, PRESSURE_BREAK_CONFIG.dropMoveMul);
  near(manualDrop.knockbackMul, PRESSURE_BREAK_CONFIG.dropKnockbackMul);
  check(
    manualDrop.damageMul > 1 &&
      manualDrop.areaMul > 1 &&
      manualDrop.projectileSpeedMul > 1 &&
      manualDrop.moveMul > 1 &&
      manualDrop.knockbackMul > 1,
    'the Drop contains a non-positive gameplay modifier',
  );
  check(PRESSURE_BREAK_CONFIG.dropBars === 4, 'Drop must span exactly four bars');
  near(PRESSURE_BREAK_CONFIG.openingShoveRadius, 220);

  const duplicateBoundary = updatePressureBreak(manualDrop.state, {
    dtS: 0,
    closeEnemyCount: 20,
    phraseBoundary: 7,
  });
  check(duplicateBoundary.state.phase === 'drop', 'duplicate start boundary ended the Drop');
  check(duplicateBoundary.isDropActive, 'duplicate boundary removed active buffs');

  const beforeEndingBoundary = updatePressureBreak(duplicateBoundary.state, {
    // Wall time never decides a musical reward's length. Without the next
    // phrase boundary, even a large frame must leave all four-bar buffs live.
    dtS: 60,
    closeEnemyCount: 0,
  });
  check(beforeEndingBoundary.state.phase === 'drop', 'Drop ended between phrase boundaries');
  check(beforeEndingBoundary.isDropActive, 'Drop buffs expired before the phrase ended');

  pressure = updatePressureBreak(pressure.state, {
    dtS: 0,
    closeEnemyCount: 20,
    phraseBoundary: 7,
  });
  check(pressure.state.phase === 'drop', 'queued Drop missed its phrase boundary');
  check(pressure.isDropActive, 'phrase entry did not apply buffs immediately');
  pressure = updatePressureBreak(pressure.state, {
    dtS: 0,
    closeEnemyCount: 20,
    phraseBoundary: 8,
  });
  check(pressure.state.phase === 'cooldown', 'four-bar Drop did not end at the next phrase');
  same(pressure.events, ['drop-finished'], 'Drop finish event drifted');
  check(!pressure.isDropActive, 'positive modifiers leaked into cooldown');
  near(pressure.damageMul, 1);
  near(pressure.areaMul, 1);
  near(pressure.projectileSpeedMul, 1);
  near(pressure.moveMul, 1);
  near(pressure.knockbackMul, 1);
  near(pressure.state.cooldownRemainingS, 45);
  pressure = updatePressureBreak(pressure.state, { dtS: 45, closeEnemyCount: 0 });
  check(pressure.state.phase === 'charging', '45-second cooldown drifted');
}

runTourChecks();
console.log('tour checks passed');
