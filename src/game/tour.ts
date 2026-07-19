// Pure data and simulation helpers for the endless Midnight Tour and its two
// reactive set-pieces. This module deliberately has no renderer, browser, or
// audio imports: RunWorld owns effects, game.ts owns phrase-accurate flow, and
// the audio engine owns the Drop's mix lift and accents.

// ---------------------------------------------------------------------------
// Venues and five-minute tour gates

export const VENUE_IDS = [
  'alley',
  'warehouse',
  'rooftop',
  'metro',
  'basement',
  'dawn',
] as const;

export type VenueId = (typeof VENUE_IDS)[number];

export interface VenueDefinition {
  readonly id: VenueId;
  readonly name: string;
  readonly tagline: string;
  /** Earliest five-minute gate at which this venue may be offered. */
  readonly availableFromGate: number;
  readonly floorColor: number;
  readonly accentColor: number;
  readonly ruleName: string;
  readonly ruleDescription: string;
  readonly mechanic: VenueMechanic;
}

/** Exact simulation knobs for each venue's one benefit/one danger rule. */
export type VenueMechanic =
  | {
      readonly kind: 'alley-bounce';
      readonly movingProjectileFreeBounces: 1;
      readonly enemySpeedMul: 1.12;
    }
  | {
      readonly kind: 'warehouse-lights';
      readonly lightPoolsMove: true;
      readonly litEnemyDamageMul: 1.2;
      readonly unlitPlayerSpeedMul: 0.92;
    }
  | {
      readonly kind: 'rooftop-wind';
      readonly velocityShiftIsSigned: true;
      readonly projectileVelocityShiftMax: 0.18;
      readonly enemySpeedMul: 1.08;
    }
  | {
      readonly kind: 'metro-train';
      readonly telegraphed: true;
      readonly laneIntervalS: 40;
      readonly playerDamage: 30;
      readonly clearsOrdinaryEnemies: true;
    }
  | {
      readonly kind: 'basement-puddles';
      readonly enemySpeedMul: 0.7;
      readonly playerSpeedMul: 0.9;
      readonly zoneLifetimeMul: 1.2;
    }
  | {
      readonly kind: 'dawn-light';
      readonly healAmount: 1;
      readonly healIntervalS: 2;
      readonly contactDamageMul: 1.25;
    };

/** Stable registry shared by gate UI, endless scaling, and arena art. */
export const VENUES: Readonly<Record<VenueId, Readonly<VenueDefinition>>> = freezeVenueRegistry({
  alley: {
    id: 'alley',
    name: 'Neon Alley',
    tagline: 'The first crowd spills out behind the club.',
    availableFromGate: 0,
    floorColor: 0x11162b,
    accentColor: 0x33e6c2,
    ruleName: 'Wall Runner',
    ruleDescription: 'Every moving projectile gets one free bounce. Enemies move 12% faster.',
    mechanic: {
      kind: 'alley-bounce',
      movingProjectileFreeBounces: 1,
      enemySpeedMul: 1.12,
    },
  },
  warehouse: {
    id: 'warehouse',
    name: 'Midnight Warehouse',
    tagline: 'A packed concrete room where every hit hangs in the haze.',
    availableFromGate: 1,
    floorColor: 0x171824,
    accentColor: 0xff5a3c,
    ruleName: 'Moving Spotlights',
    ruleDescription: 'Enemies in the light take 20% more damage. You move 8% slower outside it.',
    mechanic: {
      kind: 'warehouse-lights',
      lightPoolsMove: true,
      litEnemyDamageMul: 1.2,
      unlitPlayerSpeedMul: 0.92,
    },
  },
  rooftop: {
    id: 'rooftop',
    name: 'Velvet Rooftop',
    tagline: 'Warm lights, open sky, and a crowd pushed by the crosswind.',
    availableFromGate: 1,
    floorColor: 0x211a31,
    accentColor: 0xff6bd6,
    ruleName: 'Crosswind',
    ruleDescription: 'Wind shifts projectile velocity by up to 18%. Enemies move 8% faster.',
    mechanic: {
      kind: 'rooftop-wind',
      velocityShiftIsSigned: true,
      projectileVelocityShiftMax: 0.18,
      enemySpeedMul: 1.08,
    },
  },
  metro: {
    id: 'metro',
    name: 'Last Metro',
    tagline: 'The platform keeps filling faster than it can empty.',
    availableFromGate: 1,
    floorColor: 0x101c2b,
    accentColor: 0x3ce0ff,
    ruleName: 'Last Train',
    ruleDescription: 'Every 40 seconds a warned lane deals 30 damage to you and clears ordinary enemies.',
    mechanic: {
      kind: 'metro-train',
      telegraphed: true,
      laneIntervalS: 40,
      playerDamage: 30,
      clearsOrdinaryEnemies: true,
    },
  },
  basement: {
    id: 'basement',
    name: 'Acid Basement',
    tagline: 'Low ceiling, heavy air, nowhere for the low end to escape.',
    availableFromGate: 1,
    floorColor: 0x142016,
    accentColor: 0xb6ff5a,
    ruleName: 'Flooded Floor',
    ruleDescription: 'Puddles slow enemies 30% and you 10%. Zones last 20% longer.',
    mechanic: {
      kind: 'basement-puddles',
      enemySpeedMul: 0.7,
      playerSpeedMul: 0.9,
      zoneLifetimeMul: 1.2,
    },
  },
  dawn: {
    id: 'dawn',
    name: 'Dawn Afterparty',
    tagline: 'The sun comes up. Nobody leaves. The city turns gold.',
    availableFromGate: 1,
    floorColor: 0x2b1d2a,
    accentColor: 0xffd76b,
    ruleName: 'First Light',
    ruleDescription: 'Light heals 1 HP every 2 seconds. Contact damage is 25% higher.',
    mechanic: {
      kind: 'dawn-light',
      healAmount: 1,
      healIntervalS: 2,
      contactDamageMul: 1.25,
    },
  },
});

export function isVenueId(value: string): value is VenueId {
  return (VENUE_IDS as readonly string[]).includes(value);
}

export function venue(id: VenueId | string = 'alley'): Readonly<VenueDefinition> {
  return VENUES[isVenueId(id) ? id : 'alley'];
}

export const TOUR_GATE_INTERVAL_S = 5 * 60;
export const TOUR_GATE_LOCK_BEFORE_TRANSITION_S = 2;
export const TOUR_GATE_SELECTION_S = 18;
export const TOUR_GATE_OPTION_COUNT = 2;
export const CORE_VENUE_IDS: readonly VenueId[] = ['alley', 'warehouse', 'rooftop'];

export interface TourGateWindow {
  /** One-based: gate 1 selects before the 5:00 transition, gate 2 before 10:00. */
  gateNumber: number;
  opensAtS: number;
  closesAtS: number;
  transitionsAtS: number;
}

export type GateSelectionPhase = 'before' | 'open' | 'expired';

export interface GateSelectionTiming extends TourGateWindow {
  phase: GateSelectionPhase;
  /** 0 at open and 1 at timeout. */
  progress: number;
  remainingS: number;
}

/** Return the exact selection window for a one-based five-minute gate. */
export function gateWindow(
  gateNumber: number,
  selectionS = TOUR_GATE_SELECTION_S,
): TourGateWindow {
  const gate = Math.max(1, Math.floor(finiteOr(gateNumber, 1)));
  const transitionsAtS = gate * TOUR_GATE_INTERVAL_S;
  const closesAtS = transitionsAtS - TOUR_GATE_LOCK_BEFORE_TRANSITION_S;
  const opensAtS = closesAtS - Math.max(0, finiteOr(selectionS, TOUR_GATE_SELECTION_S));
  return {
    gateNumber: gate,
    opensAtS,
    closesAtS,
    transitionsAtS,
  };
}

/** Timing state suitable for countdown UI and deterministic timeout handling. */
export function gateSelectionTiming(
  nowS: number,
  gateNumber: number,
  selectionS = TOUR_GATE_SELECTION_S,
): GateSelectionTiming {
  const window = gateWindow(gateNumber, selectionS);
  const now = Math.max(0, finiteOr(nowS, 0));
  const duration = window.closesAtS - window.opensAtS;
  const phase: GateSelectionPhase =
    now < window.opensAtS ? 'before' : now < window.closesAtS ? 'open' : 'expired';
  return {
    ...window,
    phase,
    progress: duration <= 0 ? (phase === 'before' ? 0 : 1) : clamp01((now - window.opensAtS) / duration),
    remainingS: Math.max(0, window.closesAtS - now),
  };
}

/** All one-based gate numbers crossed in `(previousS, nowS]`. */
export function crossedGateNumbers(previousS: number, nowS: number): number[] {
  const from = Math.max(0, finiteOr(previousS, 0));
  const to = Math.max(0, finiteOr(nowS, 0));
  if (to <= from) return [];
  const openLead = TOUR_GATE_LOCK_BEFORE_TRANSITION_S + TOUR_GATE_SELECTION_S;
  const first = Math.max(1, Math.floor((from + openLead) / TOUR_GATE_INTERVAL_S) + 1);
  const last = Math.floor((to + openLead) / TOUR_GATE_INTERVAL_S);
  const crossed: number[] = [];
  for (let gate = first; gate <= last; gate++) crossed.push(gate);
  return crossed;
}

/** One-based number of the next unopened gate. At exactly 4:40 this is 2. */
export function nextGateNumber(nowS: number): number {
  const openLead = TOUR_GATE_LOCK_BEFORE_TRANSITION_S + TOUR_GATE_SELECTION_S;
  return Math.floor((Math.max(0, finiteOr(nowS, 0)) + openLead) / TOUR_GATE_INTERVAL_S) + 1;
}

export type TourSeed = number | string;

export interface VenueGateOption {
  gateNumber: number;
  optionIndex: number;
  venueId: VenueId;
  venue: VenueDefinition;
  /** True when the supplied history has not visited this venue. */
  firstVisit: boolean;
}

/**
 * Generate distinct route choices. New venues sort ahead of revisits, while a
 * stable seeded shuffle decides order within each group. The current venue is
 * never offered, and later venues cannot leak into early gates.
 */
export function gateOptions(
  seed: TourSeed,
  gateNumber: number,
  currentVenue: VenueId = 'alley',
  visited: readonly VenueId[] = [currentVenue],
  count = TOUR_GATE_OPTION_COUNT,
  unlockedVenues: readonly VenueId[] = CORE_VENUE_IDS,
): VenueGateOption[] {
  const gate = Math.max(1, Math.floor(finiteOr(gateNumber, 1)));
  const wanted = Math.max(1, Math.min(VENUE_IDS.length - 1, Math.floor(finiteOr(count, 2))));
  const seen = new Set<VenueId>(visited);
  const unlocked = new Set<VenueId>(unlockedVenues);
  const candidates = VENUE_IDS.filter(
    (id) => unlocked.has(id) && id !== currentVenue && VENUES[id].availableFromGate <= gate,
  );
  const scored = candidates.map((id) => ({
    id,
    firstVisit: !seen.has(id),
    score: seededUnit(seed, `gate:${gate}:venue:${id}`),
  }));
  scored.sort((a, b) => {
    if (a.firstVisit !== b.firstVisit) return a.firstVisit ? -1 : 1;
    if (a.score !== b.score) return a.score - b.score;
    return a.id.localeCompare(b.id);
  });
  return scored.slice(0, wanted).map((candidate, optionIndex) => ({
    gateNumber: gate,
    optionIndex,
    venueId: candidate.id,
    venue: VENUES[candidate.id],
    firstVisit: candidate.firstVisit,
  }));
}

export interface GateChoiceResolution {
  venueId: VenueId;
  reason: 'player' | 'timeout';
  selectedAtS: number;
}

/**
 * Accept a valid player choice while the window is open. Once it expires, the
 * first seeded option is the deterministic fallback; before opening, or while
 * still awaiting input, the result is `null`.
 */
export function resolveGateChoice(
  options: readonly VenueGateOption[],
  requested: VenueId | null,
  nowS: number,
  window: TourGateWindow,
): GateChoiceResolution | null {
  const now = Math.max(0, finiteOr(nowS, 0));
  const currentOptions = options.filter((option) => option.gateNumber === window.gateNumber);
  if (now < window.opensAtS || currentOptions.length === 0) return null;
  if (now < window.closesAtS) {
    const chosen = requested && currentOptions.find((option) => option.venueId === requested);
    return chosen ? { venueId: chosen.venueId, reason: 'player', selectedAtS: now } : null;
  }
  return {
    venueId: currentOptions[0].venueId,
    reason: 'timeout',
    selectedAtS: window.closesAtS,
  };
}

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
 * Locked per-minute enemy scaling. HP, damage, XP, and headliner toughness keep
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

export type EndlessMinuteEvent = { type: 'headliner'; count: number };

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
  headlinerCount: number;
  minuteEvents: readonly EndlessMinuteEvent[];
}

/**
 * Exact post-minute-eight wave recipe. Minutes 8..14 use their authored rows;
 * minute 15 onward cycles through pairs of adjacent rows for combinatorial
 * pressure. Five-minute marks add 1..4 headliners.
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

// ---------------------------------------------------------------------------
// Neon Loop recording, simplification, and reflection geometry

export interface Point2 {
  x: number;
  y: number;
}

export interface Segment2 {
  a: Point2;
  b: Point2;
}

export const NEON_LOOP_RDP_TOLERANCE = 6;

export interface NeonLoopSampleConfig {
  minDistance: number;
  sampleIntervalS: number;
  maxPoints: number;
}

export const NEON_LOOP_SAMPLE_CONFIG: Readonly<NeonLoopSampleConfig> = {
  minDistance: 10,
  sampleIntervalS: 0.1,
  maxPoints: 480,
};

export interface NeonLoopSamples {
  points: readonly Point2[];
  lastSampleAtS: number;
}

export function createNeonLoopSamples(start?: Point2, atS = 0): NeonLoopSamples {
  return {
    points: start ? [copyPoint(start)] : [],
    lastSampleAtS: Math.max(0, finiteOr(atS, 0)),
  };
}

/**
 * Sample a moving player's path without frame-rate dependence. Tiny stationary
 * duplicates are ignored; a point is admitted only after the 0.1-second
 * cadence and the minimum travel distance are both met. The oldest point falls
 * off when the bounded recorder is full.
 */
export function sampleNeonLoopPoint(
  samples: NeonLoopSamples,
  point: Point2,
  atS: number,
  config: NeonLoopSampleConfig = NEON_LOOP_SAMPLE_CONFIG,
): NeonLoopSamples {
  const next = copyPoint(point);
  const now = Math.max(samples.lastSampleAtS, finiteOr(atS, samples.lastSampleAtS));
  const last = samples.points[samples.points.length - 1];
  if (last) {
    const distanceSq = pointDistanceSq(last, next);
    if (distanceSq < 0.25) return samples;
    const minDistance = Math.max(0, finiteOr(config.minDistance, 10));
    const sampleIntervalS = Math.max(
      0,
      finiteOr(config.sampleIntervalS, NEON_LOOP_SAMPLE_CONFIG.sampleIntervalS),
    );
    if (distanceSq < minDistance * minDistance || now - samples.lastSampleAtS < sampleIntervalS) {
      return samples;
    }
  }
  const maxPoints = Math.max(2, Math.floor(finiteOr(config.maxPoints, 480)));
  const points = [...samples.points, next];
  if (points.length > maxPoints) points.splice(0, points.length - maxPoints);
  return { points, lastSampleAtS: now };
}

/** Standard Ramer–Douglas–Peucker simplification; default tolerance is 6. */
export function simplifyNeonLoop(
  input: readonly Point2[],
  tolerance = NEON_LOOP_RDP_TOLERANCE,
): Point2[] {
  const points = dedupeConsecutive(input);
  if (points.length <= 2) return points;
  const toleranceSq = Math.max(0, finiteOr(tolerance, NEON_LOOP_RDP_TOLERANCE)) ** 2;
  if (toleranceSq === 0) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  simplifyRange(points, 0, points.length - 1, toleranceSq, keep);
  return points.filter((_, index) => keep[index] === 1);
}

export type NeonRailKind = 'loop' | 'fallback';

export interface NeonRail {
  kind: NeonRailKind;
  points: readonly Point2[];
  segments: readonly Segment2[];
  closed: boolean;
  length: number;
}

export interface NeonRailBuildConfig {
  tolerance: number;
  maxSegments: number;
  minLoopLength: number;
  fallbackLength: number;
}

export const NEON_RAIL_BUILD_CONFIG: Readonly<NeonRailBuildConfig> = {
  tolerance: NEON_LOOP_RDP_TOLERANCE,
  maxSegments: 48,
  minLoopLength: 80,
  fallbackLength: 120,
};

/**
 * A guaranteed useful rail when the player did not draw enough of a loop. The
 * rail lies perpendicular to the supplied heading and is centered on `center`.
 */
export function fallbackNeonRail(
  center: Point2,
  heading: Point2 = { x: 1, y: 0 },
  length = NEON_RAIL_BUILD_CONFIG.fallbackLength,
): NeonRail {
  const facing = normalized(heading, { x: 1, y: 0 });
  const tangent = { x: -facing.y, y: facing.x };
  const half = Math.max(1, finiteOr(length, NEON_RAIL_BUILD_CONFIG.fallbackLength)) / 2;
  const a = { x: center.x - tangent.x * half, y: center.y - tangent.y * half };
  const b = { x: center.x + tangent.x * half, y: center.y + tangent.y * half };
  return {
    kind: 'fallback',
    points: [a, b],
    segments: [{ a, b }],
    closed: false,
    length: half * 2,
  };
}

/** Simplify the recorded path into an open rail, or return the guaranteed fallback. */
export function buildNeonLoopRail(
  input: readonly Point2[],
  fallbackCenter: Point2 = input[input.length - 1] ?? { x: 0, y: 0 },
  fallbackHeading: Point2 = { x: 1, y: 0 },
  config: NeonRailBuildConfig = NEON_RAIL_BUILD_CONFIG,
): NeonRail {
  let points = dedupeConsecutive(input);
  points = simplifyNeonLoop(points, config.tolerance);
  points = limitPointCount(
    points,
    Math.max(
      2,
      Math.floor(finiteOr(config.maxSegments, NEON_RAIL_BUILD_CONFIG.maxSegments)) + 1,
    ),
  );
  const length = polylineLength(points);
  if (
    points.length < 2 ||
    length < Math.max(0, finiteOr(config.minLoopLength, 80))
  ) {
    return fallbackNeonRail(fallbackCenter, fallbackHeading, config.fallbackLength);
  }
  const segments: Segment2[] = [];
  for (let i = 1; i < points.length; i++) {
    segments.push({ a: points[i - 1], b: points[i] });
  }
  return { kind: 'loop', points, segments, closed: false, length };
}

/** True when non-neighboring path segments cross through their interiors. */
export function neonLoopCrossesItself(
  points: readonly Point2[],
  closed = false,
): boolean {
  const count = closed ? points.length : Math.max(0, points.length - 1);
  if (count < 3) return false;
  const segments: Segment2[] = [];
  for (let i = 0; i < count; i++) {
    segments.push({ a: points[i], b: points[(i + 1) % points.length] });
  }
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      if (j === i + 1 || (closed && i === 0 && j === segments.length - 1)) continue;
      const hit = segmentIntersection(segments[i], segments[j]);
      if (!hit) continue;
      if (hit.t > 1e-7 && hit.t < 1 - 1e-7 && hit.u > 1e-7 && hit.u < 1 - 1e-7) {
        return true;
      }
    }
  }
  return false;
}

export interface SegmentIntersection {
  point: Point2;
  /** Fraction along the first segment, 0..1. */
  t: number;
  /** Fraction along the second segment, 0..1. */
  u: number;
  /** Unit rail normal oriented against the first segment's travel. */
  normal: Point2;
}

/** Inclusive finite-segment intersection. Parallel/collinear travel is ignored. */
export function segmentIntersection(
  movement: Segment2,
  rail: Segment2,
  epsilon = 1e-9,
): SegmentIntersection | null {
  const r = subtract(movement.b, movement.a);
  const s = subtract(rail.b, rail.a);
  const denominator = cross(r, s);
  const eps = Math.max(Number.EPSILON, Math.abs(finiteOr(epsilon, 1e-9)));
  if (Math.abs(denominator) <= eps) return null;
  const qMinusP = subtract(rail.a, movement.a);
  const t = cross(qMinusP, s) / denominator;
  const u = cross(qMinusP, r) / denominator;
  if (t < -eps || t > 1 + eps || u < -eps || u > 1 + eps) return null;
  const clampedT = clamp01(t);
  const tangent = normalized(s, { x: 1, y: 0 });
  let normal = { x: -tangent.y, y: tangent.x };
  if (dot(r, normal) > 0) normal = { x: -normal.x, y: -normal.y };
  return {
    point: {
      x: movement.a.x + r.x * clampedT,
      y: movement.a.y + r.y * clampedT,
    },
    t: clampedT,
    u: clamp01(u),
    normal,
  };
}

export interface RailIntersection extends SegmentIntersection {
  segmentIndex: number;
  segment: Segment2;
}

/** Earliest rail hit, excluding a configurable t=0 self-hit after a bounce. */
export function firstRailIntersection(
  movement: Segment2,
  rails: readonly Segment2[],
  minT = 1e-6,
): RailIntersection | null {
  const minimum = Math.max(0, finiteOr(minT, 1e-6));
  const hits: RailIntersection[] = [];
  rails.forEach((segment, segmentIndex) => {
    const hit = segmentIntersection(movement, segment);
    if (!hit || hit.t < minimum) return;
    hits.push({ ...hit, segmentIndex, segment });
  });
  if (hits.length === 0) return null;
  hits.sort((a, b) => a.t - b.t || a.segmentIndex - b.segmentIndex);
  const first = hits[0];
  const tied = hits.filter((hit) => Math.abs(hit.t - first.t) <= 1e-7);
  if (tied.length === 1) return first;
  const summedNormal = tied.reduce(
    (sum, hit) => ({ x: sum.x + hit.normal.x, y: sum.y + hit.normal.y }),
    { x: 0, y: 0 },
  );
  let normal: Point2;
  if (magnitudeSq(summedNormal) > 1e-12) {
    normal = normalized(summedNormal, first.normal);
  } else {
    // A perfect crossing can produce cancelling normals. Choose by geometry,
    // not caller segment order, so reversing the rail array cannot change it.
    normal = [...tied]
      .map((hit) => hit.normal)
      .sort((a, b) => a.x - b.x || a.y - b.y)[0];
  }
  return { ...first, normal };
}

/** Reflect a vector around a unit or non-unit normal. */
export function reflectVector(
  vector: Point2,
  normal: Point2,
  restitution = 1,
): Point2 {
  const n = normalized(normal, { x: 0, y: -1 });
  const bounce = Math.max(0, finiteOr(restitution, 1));
  const projection = dot(vector, n);
  return {
    x: (vector.x - 2 * projection * n.x) * bounce,
    y: (vector.y - 2 * projection * n.y) * bounce,
  };
}

/** Reflect an incoming vector off a rail segment while preserving speed by default. */
export function reflectOffSegment(
  vector: Point2,
  rail: Segment2,
  restitution = 1,
): Point2 {
  const tangent = subtract(rail.b, rail.a);
  if (magnitudeSq(tangent) <= Number.EPSILON) return copyPoint(vector);
  let normal = normalized({ x: -tangent.y, y: tangent.x }, { x: 0, y: -1 });
  if (dot(vector, normal) > 0) normal = { x: -normal.x, y: -normal.y };
  return reflectVector(vector, normal, restitution);
}

export interface ReflectedRailHit extends RailIntersection {
  reflectedVelocity: Point2;
  /** End of the unused part of this movement after one bounce. */
  remainingEnd: Point2;
}

/** One-frame convenience helper: find the first hit and reflect the remainder. */
export function intersectAndReflect(
  movement: Segment2,
  velocity: Point2,
  rails: readonly Segment2[],
  restitution = 1,
): ReflectedRailHit | null {
  const hit = firstRailIntersection(movement, rails);
  if (!hit) return null;
  const displacement = subtract(movement.b, movement.a);
  const reflectedDisplacement = reflectVector(displacement, hit.normal, restitution);
  const remaining = 1 - hit.t;
  const reflectedVelocity = reflectVector(velocity, hit.normal, restitution);
  return {
    ...hit,
    reflectedVelocity,
    remainingEnd: {
      x: hit.point.x + reflectedDisplacement.x * remaining + hit.normal.x * 1e-4,
      y: hit.point.y + reflectedDisplacement.y * remaining + hit.normal.y * 1e-4,
    },
  };
}

// ---------------------------------------------------------------------------
// Pressure Drop: pure phrase-boundary state machine

export type PressureBreakPhase = 'charging' | 'armed' | 'drop' | 'cooldown';

export interface PressureBreakConfig {
  maxHeat: number;
  proximityPadding: number;
  heatPerCloseEnemyPerS: number;
  maxHeatPerS: number;
  emptyDecayPerS: number;
  closeKillHeat: number;
  hitHeatLoss: number;
  dropBars: 4;
  dropDamageMul: number;
  dropAreaMul: number;
  dropProjectileSpeedMul: number;
  dropMoveMul: number;
  dropKnockbackMul: number;
  openingShoveRadius: number;
  cooldownS: number;
}

/** Locked Pressure Drop contract. One Drop is one complete four-bar phrase. */
export const PRESSURE_BREAK_CONFIG: Readonly<PressureBreakConfig> = Object.freeze({
  maxHeat: 100,
  proximityPadding: 130,
  heatPerCloseEnemyPerS: 0.45,
  maxHeatPerS: 6,
  emptyDecayPerS: 3,
  closeKillHeat: 2,
  hitHeatLoss: 30,
  dropBars: 4,
  dropDamageMul: 1.5,
  dropAreaMul: 1.25,
  dropProjectileSpeedMul: 1.2,
  dropMoveMul: 1.15,
  dropKnockbackMul: 1.25,
  openingShoveRadius: 220,
  cooldownS: 45,
});

export interface PressureBreakState {
  phase: PressureBreakPhase;
  heat: number;
  /** Heat is full and the Drop is queued for the next four-bar phrase. */
  armPending: boolean;
  cooldownRemainingS: number;
  cycle: number;
  /** Monotonic phrase id last consumed; duplicate callbacks are ignored. */
  lastPhraseSerial: number;
  /** Phrase where the Drop began, or null outside the four-bar power window. */
  dropStartedPhraseSerial: number | null;
}

export type PressureBreakEvent =
  | 'armed'
  | 'drop-started'
  | 'drop-finished'
  | 'cooled-down';

export interface PressureBreakUpdate {
  state: PressureBreakState;
  events: readonly PressureBreakEvent[];
  heatRatePerS: number;
  isDropActive: boolean;
  damageMul: number;
  areaMul: number;
  projectileSpeedMul: number;
  moveMul: number;
  knockbackMul: number;
}

export interface PressureBreakInput {
  dtS: number;
  closeEnemyCount: number;
  /** Monotonic id of a crossed four-bar phrase boundary; omit between boundaries. */
  phraseBoundary?: number;
}

export function createPressureBreakState(): PressureBreakState {
  return {
    phase: 'charging',
    heat: 0,
    armPending: false,
    cooldownRemainingS: 0,
    cycle: 0,
    lastPhraseSerial: -1,
    dropStartedPhraseSerial: null,
  };
}

/** Radius used when counting pressure enemies: player radius plus 130 units. */
export function pressureRadius(playerRadius: number): number {
  return Math.max(0, finiteOr(playerRadius, 0)) + PRESSURE_BREAK_CONFIG.proximityPadding;
}

/** Exact heat rate: +0.45 per close enemy, capped at +6; no enemies means -3. */
export function pressureHeatRate(closeEnemyCount: number): number {
  const count = Math.max(0, Math.floor(finiteOr(closeEnemyCount, 0)));
  return count === 0
    ? -PRESSURE_BREAK_CONFIG.emptyDecayPerS
    : Math.min(
        PRESSURE_BREAK_CONFIG.maxHeatPerS,
        count * PRESSURE_BREAK_CONFIG.heatPerCloseEnemyPerS,
      );
}

/** A close-range kill adds exactly two heat while the meter can charge. */
export function addPressureCloseKill(
  previous: PressureBreakState,
  close = true,
): PressureBreakState {
  if (!close || previous.phase !== 'charging') return previous;
  const heat = Math.min(
    PRESSURE_BREAK_CONFIG.maxHeat,
    previous.heat + PRESSURE_BREAK_CONFIG.closeKillHeat,
  );
  return { ...previous, heat, armPending: heat >= PRESSURE_BREAK_CONFIG.maxHeat };
}

/** Taking a hit removes 30 heat while charging. Ready/live Drops never become
 * weaker: once earned, the complete four-bar reward is guaranteed. */
export function applyPressureHit(previous: PressureBreakState): PressureBreakState {
  if (previous.phase !== 'charging') return previous;
  const heat = Math.max(0, previous.heat - PRESSURE_BREAK_CONFIG.hitHeatLoss);
  return {
    ...previous,
    heat,
    armPending: heat >= PRESSURE_BREAK_CONFIG.maxHeat,
  };
}

/** Begin the power window at an armed phrase boundary. Nothing was withheld
 * beforehand; this transition only adds positive modifiers. */
export function beginPressureDrop(
  previous: PressureBreakState,
  phraseSerial: number,
): PressureBreakUpdate {
  const serial = pressureBoundarySerial(phraseSerial);
  if (previous.phase !== 'armed' || serial <= previous.lastPhraseSerial) {
    return pressureUpdateResult(previous, [], 0);
  }
  const state: PressureBreakState = {
    ...previous,
    phase: 'drop',
    armPending: false,
    cycle: previous.cycle + 1,
    lastPhraseSerial: serial,
    dropStartedPhraseSerial: serial,
  };
  return pressureUpdateResult(state, ['drop-started'], 0);
}

/** End the Drop at the next phrase boundary and only then start cooldown. */
export function finishPressureDrop(
  previous: PressureBreakState,
  phraseSerial: number,
): PressureBreakUpdate {
  const serial = pressureBoundarySerial(phraseSerial);
  if (
    previous.phase !== 'drop' ||
    previous.dropStartedPhraseSerial === null ||
    serial <= previous.dropStartedPhraseSerial ||
    serial <= previous.lastPhraseSerial
  ) {
    return pressureUpdateResult(previous, [], 0);
  }
  const state: PressureBreakState = {
    ...previous,
    phase: 'cooldown',
    heat: 0,
    armPending: false,
    cooldownRemainingS: PRESSURE_BREAK_CONFIG.cooldownS,
    lastPhraseSerial: serial,
    dropStartedPhraseSerial: null,
  };
  return pressureUpdateResult(state, ['drop-finished'], 0);
}

/** Consume one unique phrase boundary and perform its queued transition. */
export function advancePressurePhraseBoundary(
  previous: PressureBreakState,
  phraseSerial: number,
): PressureBreakUpdate {
  const serial = pressureBoundarySerial(phraseSerial);
  if (serial <= previous.lastPhraseSerial) return pressureUpdateResult(previous, [], 0);
  if (previous.phase === 'armed') return beginPressureDrop(previous, serial);
  if (previous.phase === 'drop') return finishPressureDrop(previous, serial);
  return pressureUpdateResult({ ...previous, lastPhraseSerial: serial }, [], 0);
}

/**
 * Advance heat/cooldown and consume phrase boundaries. Full heat enters the
 * armed/queued phase immediately; the next phrase boundary starts a positive
 * power window and the following boundary ends it, guaranteeing four bars.
 */
export function updatePressureBreak(
  previous: PressureBreakState,
  input: PressureBreakInput,
): PressureBreakUpdate {
  const dtS = Math.max(0, finiteOr(input.dtS, 0));
  let state = sanitizePressureState(previous);
  const events: PressureBreakEvent[] = [];
  let heatRatePerS = 0;

  if (state.phase === 'cooldown') {
    const cooldownRemainingS = Math.max(0, state.cooldownRemainingS - dtS);
    if (cooldownRemainingS > 0) {
      state = { ...state, cooldownRemainingS };
    } else {
      const leftoverS = Math.max(0, dtS - state.cooldownRemainingS);
      const lastPhraseSerial = state.lastPhraseSerial;
      state = {
        ...createPressureBreakState(),
        cycle: previous.cycle,
        lastPhraseSerial,
      };
      events.push('cooled-down');
      if (leftoverS > 0) {
        heatRatePerS = pressureHeatRate(input.closeEnemyCount);
        const heat = clampHeat(state.heat + heatRatePerS * leftoverS);
        state = { ...state, heat, armPending: heat >= PRESSURE_BREAK_CONFIG.maxHeat };
      }
    }
  } else if (state.phase === 'charging') {
    heatRatePerS = pressureHeatRate(input.closeEnemyCount);
    const heat = clampHeat(state.heat + heatRatePerS * dtS);
    state = { ...state, heat, armPending: heat >= PRESSURE_BREAK_CONFIG.maxHeat };
  }

  if (state.phase === 'charging' && state.armPending) {
    state = { ...state, phase: 'armed', heat: PRESSURE_BREAK_CONFIG.maxHeat };
    events.push('armed');
  }
  if (input.phraseBoundary !== undefined) {
    const boundaryUpdate = advancePressurePhraseBoundary(state, input.phraseBoundary);
    state = boundaryUpdate.state;
    events.push(...boundaryUpdate.events);
  }
  return pressureUpdateResult(state, events, heatRatePerS);
}

// ---------------------------------------------------------------------------
// Internal numeric helpers

function freezeVenueRegistry(
  registry: Record<VenueId, VenueDefinition>,
): Readonly<Record<VenueId, Readonly<VenueDefinition>>> {
  for (const id of VENUE_IDS) {
    Object.freeze(registry[id].mechanic);
    Object.freeze(registry[id]);
  }
  return Object.freeze(registry);
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

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function finitePower(base: number, exponent: number): number {
  const value = base ** exponent;
  return Number.isFinite(value) ? value : Number.MAX_VALUE;
}

function seedToUint32(seed: TourSeed): number {
  if (typeof seed === 'number') {
    const finite = finiteOr(seed, 0);
    return mix32(Math.floor(finite) >>> 0);
  }
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return mix32(hash >>> 0);
}

function seededUnit(seed: TourSeed, salt: string): number {
  return seedToUint32(`${seed}:${salt}`) / 0x1_0000_0000;
}

function mix32(value: number): number {
  let x = value >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}

function copyPoint(point: Point2): Point2 {
  return { x: finiteOr(point.x, 0), y: finiteOr(point.y, 0) };
}

function subtract(a: Point2, b: Point2): Point2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

function dot(a: Point2, b: Point2): number {
  return a.x * b.x + a.y * b.y;
}

function cross(a: Point2, b: Point2): number {
  return a.x * b.y - a.y * b.x;
}

function magnitudeSq(vector: Point2): number {
  return dot(vector, vector);
}

function normalized(vector: Point2, fallback: Point2): Point2 {
  const magnitude = Math.sqrt(magnitudeSq(vector));
  if (magnitude <= Number.EPSILON) return copyPoint(fallback);
  return { x: vector.x / magnitude, y: vector.y / magnitude };
}

function pointDistanceSq(a: Point2, b: Point2): number {
  return magnitudeSq(subtract(a, b));
}

function pointDistance(a: Point2, b: Point2): number {
  return Math.sqrt(pointDistanceSq(a, b));
}

function pointSegmentDistanceSq(point: Point2, a: Point2, b: Point2): number {
  const ab = subtract(b, a);
  const lengthSq = magnitudeSq(ab);
  if (lengthSq <= Number.EPSILON) return pointDistanceSq(point, a);
  const t = clamp01(dot(subtract(point, a), ab) / lengthSq);
  return pointDistanceSq(point, { x: a.x + ab.x * t, y: a.y + ab.y * t });
}

function dedupeConsecutive(input: readonly Point2[]): Point2[] {
  const points: Point2[] = [];
  for (const raw of input) {
    const point = copyPoint(raw);
    const last = points[points.length - 1];
    if (!last || pointDistanceSq(last, point) > Number.EPSILON) points.push(point);
  }
  return points;
}

function simplifyRange(
  points: readonly Point2[],
  first: number,
  last: number,
  toleranceSq: number,
  keep: Uint8Array,
): void {
  let farthestIndex = -1;
  let farthestDistanceSq = toleranceSq;
  for (let i = first + 1; i < last; i++) {
    const distanceSq = pointSegmentDistanceSq(points[i], points[first], points[last]);
    if (distanceSq > farthestDistanceSq) {
      farthestDistanceSq = distanceSq;
      farthestIndex = i;
    }
  }
  if (farthestIndex < 0) return;
  keep[farthestIndex] = 1;
  simplifyRange(points, first, farthestIndex, toleranceSq, keep);
  simplifyRange(points, farthestIndex, last, toleranceSq, keep);
}

function polylineLength(points: readonly Point2[]): number {
  let length = 0;
  for (let i = 1; i < points.length; i++) length += pointDistance(points[i - 1], points[i]);
  return length;
}

/** Preserve endpoints and evenly retain the RDP result under its hard rail cap. */
function limitPointCount(points: readonly Point2[], maxPoints: number): Point2[] {
  if (points.length <= maxPoints) return [...points];
  const limited: Point2[] = [];
  let previousIndex = -1;
  for (let i = 0; i < maxPoints; i++) {
    const index = Math.round((i * (points.length - 1)) / (maxPoints - 1));
    if (index === previousIndex) continue;
    limited.push(points[index]);
    previousIndex = index;
  }
  return limited;
}

function clampHeat(heat: number): number {
  return Math.max(0, Math.min(PRESSURE_BREAK_CONFIG.maxHeat, finiteOr(heat, 0)));
}

function pressureBoundarySerial(serial: number): number {
  return Math.max(0, Math.floor(finiteOr(serial, 0)));
}

function sanitizePressureState(state: PressureBreakState): PressureBreakState {
  const lastPhraseSerial = Math.max(-1, Math.floor(finiteOr(state.lastPhraseSerial, -1)));
  const dropStartedPhraseSerial = state.dropStartedPhraseSerial === null
    ? null
    : Math.max(0, Math.floor(finiteOr(state.dropStartedPhraseSerial, 0)));
  return {
    phase: state.phase,
    heat: clampHeat(state.heat),
    armPending: state.armPending === true,
    cooldownRemainingS: Math.max(0, finiteOr(state.cooldownRemainingS, 0)),
    cycle: Math.max(0, Math.floor(finiteOr(state.cycle, 0))),
    lastPhraseSerial,
    dropStartedPhraseSerial,
  };
}

function pressureUpdateResult(
  state: PressureBreakState,
  events: readonly PressureBreakEvent[],
  heatRatePerS: number,
): PressureBreakUpdate {
  const isDropActive = state.phase === 'drop';
  return {
    state,
    events,
    heatRatePerS,
    isDropActive,
    damageMul: isDropActive ? PRESSURE_BREAK_CONFIG.dropDamageMul : 1,
    areaMul: isDropActive ? PRESSURE_BREAK_CONFIG.dropAreaMul : 1,
    projectileSpeedMul: isDropActive ? PRESSURE_BREAK_CONFIG.dropProjectileSpeedMul : 1,
    moveMul: isDropActive ? PRESSURE_BREAK_CONFIG.dropMoveMul : 1,
    knockbackMul: isDropActive ? PRESSURE_BREAK_CONFIG.dropKnockbackMul : 1,
  };
}
