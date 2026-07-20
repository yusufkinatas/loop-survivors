// Standalone deterministic checks for the pure endless-run helpers.
// Run with: node --import tsx src/game/tour-check.ts

import {
  ENDLESS_WAVE_ROWS,
  endlessScale,
  waveRecipe,
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

  same(waveRecipe(8).pattern, ['skeleton', 'darter'], 'minute-eight row drifted');
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
    ['skeleton', 'darter', 'ghost', 'circler', 'zombie'],
    'minute-fifteen adjacent-row recipe drifted',
  );
  check(waveRecipe(8).floor === 244, 'minute-eight floor drifted');
  check(waveRecipe(30).floor === 360, 'wave floor cap drifted');
  near(waveRecipe(8).intervalS, 0.55);
  near(waveRecipe(500).intervalS, 0.22);
  check(waveRecipe(10).bossCount === 1, 'minute-ten boss count drifted');
  check(waveRecipe(15).bossCount === 2, 'minute-fifteen boss count drifted');
  check(waveRecipe(45).bossCount === 4, 'boss count cap drifted');
  check(waveRecipe(11).bossCount === 0, 'boss spawned off its five-minute mark');
}

runTourChecks();
console.log('tour checks passed');
