// Pure data and simulation helpers for the endless run: per-minute enemy
// scaling and the wave recipes the endless director follows. This module
// deliberately has no renderer, browser, or audio imports: RunWorld owns
// effects and game.ts owns phrase-accurate flow.

// ---------------------------------------------------------------------------
// Endless minute scaling and wave recipes

export const ENDLESS_START_MINUTE = 8;

export interface EndlessScale {
  minute: number;
  /** Exact locked multipliers, named tersely for stage integration. */
  hp: number;
  damage: number;
  speed: number;
  xp: number;
  boss: number;
  ampedChance: number;
  /** Explicit aliases for call sites that prefer multiplier suffixes. */
  hpMul: number;
  damageMul: number;
  speedMul: number;
  xpMul: number;
  bossHpMul: number;
}

/**
 * Locked per-minute enemy scaling. HP, damage, XP, and boss toughness keep
 * rising forever. Ordinary movement gets only a 30% ceiling so collision
 * remains readable while the uncapped HP/damage race eventually wins.
 */
export function endlessScale(minute: number): EndlessScale {
  const m = Math.max(0, Math.floor(finiteOr(minute, 0)));
  const hp = finitePower(1.08, m);
  const damage = finitePower(1.025, m);
  const speed = 1 + Math.min(0.3, 0.0075 * m);
  const xp = 1 + 0.015 * m;
  const boss = 1 + 0.4 * Math.floor(m / 5);
  const ampedChance = Math.min(0.18, 0.015 * (m - 11));
  return {
    minute: m,
    hp,
    damage,
    speed,
    xp,
    boss,
    ampedChance,
    hpMul: hp,
    damageMul: damage,
    speedMul: speed,
    xpMul: xp,
    bossHpMul: boss,
  };
}

export const TOUR_ENEMY_IDS = [
  'bat',
  'redBat',
  'redBat2',
  'zombie',
  'skeleton',
  'ghost',
  'greenMudman',
  'grayMudman',
  'glowingBat',
  'mantis',
  'batSwarm',
  'circler',
  'splitter',
  'shielded',
  'tank',
  'darter',
] as const;

export type TourEnemyId = (typeof TOUR_ENEMY_IDS)[number];

export type EndlessMinuteEvent = { type: 'boss'; count: number };

export interface EndlessWaveRow {
  readonly id: string;
  readonly pattern: readonly TourEnemyId[];
}

/** Exact post-minute-eight roster rows. From minute 15 onward adjacent rows combine. */
export const ENDLESS_WAVE_ROWS: readonly Readonly<EndlessWaveRow>[] = freezeWaveRows([
  { id: 'm8-bone-dash', pattern: ['skeleton', 'darter'] },
  { id: 'm9-haunt-orbit', pattern: ['ghost', 'circler', 'zombie'] },
  { id: 'm10-mud-split', pattern: ['greenMudman', 'splitter'] },
  { id: 'm11-shield-red', pattern: ['shielded', 'redBat2'] },
  { id: 'm12-tank-flight', pattern: ['tank', 'bat', 'redBat2'] },
  { id: 'm13-gray-dash', pattern: ['grayMudman', 'darter'] },
  { id: 'm14-split-orbit-shield', pattern: ['splitter', 'circler', 'shielded'] },
]);

export interface EndlessWaveRecipe {
  id: string;
  minute: number;
  pattern: readonly TourEnemyId[];
  /** Alias pair: RunWorld currently calls the live-enemy floor `minimum`. */
  floor: number;
  minimum: number;
  intervalS: number;
  scale: EndlessScale;
  ampedChance: number;
  bossCount: number;
  minuteEvents: readonly EndlessMinuteEvent[];
}

/**
 * Exact post-minute-eight wave recipe. Minutes 8..14 use their authored rows;
 * minute 15 onward cycles through pairs of adjacent rows for combinatorial
 * pressure. Five-minute marks add 1..4 elite bosses (each drops a chest).
 */
export function waveRecipe(minute: number): EndlessWaveRecipe {
  const m = Math.max(ENDLESS_START_MINUTE, Math.floor(finiteOr(minute, ENDLESS_START_MINUTE)));
  const scale = endlessScale(m);
  let id: string;
  let pattern: readonly TourEnemyId[];
  if (m <= 14) {
    const row = ENDLESS_WAVE_ROWS[m - ENDLESS_START_MINUTE];
    id = row.id;
    pattern = row.pattern;
  } else {
    const firstIndex = (m - 15) % ENDLESS_WAVE_ROWS.length;
    const secondIndex = (firstIndex + 1) % ENDLESS_WAVE_ROWS.length;
    const first = ENDLESS_WAVE_ROWS[firstIndex];
    const second = ENDLESS_WAVE_ROWS[secondIndex];
    id = `adjacent-${first.id}-${second.id}`;
    pattern = Object.freeze([...first.pattern, ...second.pattern]);
  }
  const floor = Math.min(360, 180 + 8 * m);
  const intervalS = Math.max(0.22, 0.55 * finitePower(0.985, m - ENDLESS_START_MINUTE));
  const bossCount = m % 5 === 0 ? Math.min(4, 1 + Math.floor(m / 15)) : 0;
  const minuteEvents: readonly EndlessMinuteEvent[] = Object.freeze(
    bossCount > 0 ? [{ type: 'boss', count: bossCount }] : [],
  );
  return {
    id,
    minute: m,
    pattern,
    floor,
    minimum: floor,
    intervalS,
    scale,
    ampedChance: scale.ampedChance,
    bossCount,
    minuteEvents,
  };
}

// ---------------------------------------------------------------------------
// Internal numeric helpers

function freezeWaveRows(rows: EndlessWaveRow[]): readonly Readonly<EndlessWaveRow>[] {
  for (const row of rows) {
    Object.freeze(row.pattern);
    Object.freeze(row);
  }
  return Object.freeze(rows);
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function finitePower(base: number, exponent: number): number {
  const value = base ** exponent;
  return Number.isFinite(value) ? value : Number.MAX_VALUE;
}
