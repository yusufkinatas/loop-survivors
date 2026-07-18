// Pure data and simulation helpers for uncapped minute scaling and wave
// recipes. This module deliberately has no renderer, browser, or audio imports.

export const ENDLESS_START_MINUTE = 8;

export interface EndlessScale {
  minute: number;
  /** Exact locked multipliers, named tersely for simulation integration. */
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

/** Every whole minute crossed in `(previousS, nowS]`; safe for large frames. */
export function crossedMinuteNumbers(previousS: number, nowS: number): number[] {
  const from = Math.max(0, finiteOr(previousS, 0));
  const to = Math.max(0, finiteOr(nowS, 0));
  if (to <= from) return [];
  const first = Math.floor(from / 60) + 1;
  const last = Math.floor(to / 60);
  const crossed: number[] = [];
  for (let minute = first; minute <= last; minute++) crossed.push(minute);
  return crossed;
}

/** A 1..0 envelope for the visible/audio threat bump at each minute mark. */
export function minuteScalePulse(nowS: number, durationS = 1.8): number {
  const now = Math.max(0, finiteOr(nowS, 0));
  const duration = Math.max(Number.EPSILON, finiteOr(durationS, 1.8));
  const sinceBoundary = now % 60;
  if (now < 60 || sinceBoundary >= duration) return 0;
  const t = sinceBoundary / duration;
  return (1 - t) * (1 - t);
}

export const ENDLESS_ENEMY_IDS = [
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
  'charger',
  'circler',
  'splitter',
  'shielded',
  'tank',
  'darter',
] as const;

export type EndlessEnemyId = (typeof ENDLESS_ENEMY_IDS)[number];

export type EndlessMinuteEvent = { type: 'headliner'; count: number };

export interface EndlessWaveRow {
  readonly id: string;
  readonly pattern: readonly EndlessEnemyId[];
}

/** Exact post-minute-eight roster rows. From minute 15 onward adjacent rows combine. */
export const ENDLESS_WAVE_ROWS: readonly Readonly<EndlessWaveRow>[] = freezeWaveRows([
  { id: 'm8-bone-charge', pattern: ['skeleton', 'charger'] },
  { id: 'm9-haunt-orbit', pattern: ['ghost', 'circler', 'zombie'] },
  { id: 'm10-mud-split', pattern: ['greenMudman', 'splitter'] },
  { id: 'm11-shield-red', pattern: ['shielded', 'redBat2'] },
  { id: 'm12-tank-flight', pattern: ['tank', 'bat', 'charger'] },
  { id: 'm13-gray-dash', pattern: ['grayMudman', 'darter'] },
  { id: 'm14-split-orbit-shield', pattern: ['splitter', 'circler', 'shielded'] },
]);

export interface EndlessWaveRecipe {
  id: string;
  minute: number;
  pattern: readonly EndlessEnemyId[];
  /** Alias pair: the live simulation currently calls this floor `minimum`. */
  floor: number;
  minimum: number;
  intervalS: number;
  scale: EndlessScale;
  ampedChance: number;
  headlinerCount: number;
  minuteEvents: readonly EndlessMinuteEvent[];
}

/**
 * Exact post-minute-eight wave recipe. Minutes 8..14 use their authored rows;
 * minute 15 onward cycles through pairs of adjacent rows. Five-minute marks
 * add 1..4 headliners.
 */
export function waveRecipe(minute: number): EndlessWaveRecipe {
  const m = Math.max(ENDLESS_START_MINUTE, Math.floor(finiteOr(minute, ENDLESS_START_MINUTE)));
  const scale = endlessScale(m);
  let id: string;
  let pattern: readonly EndlessEnemyId[];
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
  const headlinerCount = m % 5 === 0 ? Math.min(4, 1 + Math.floor(m / 15)) : 0;
  const minuteEvents: readonly EndlessMinuteEvent[] = Object.freeze(
    headlinerCount > 0 ? [{ type: 'headliner', count: headlinerCount }] : [],
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
    headlinerCount,
    minuteEvents,
  };
}

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
