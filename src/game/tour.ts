// Pure data and simulation helpers for the endless Midnight Tour and its two
// reactive set-pieces. This module deliberately has no renderer, browser, or
// audio imports: RunWorld owns effects, game.ts owns flow, and the audio engine
// decides how a banked trigger is ultimately voiced.

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
  'charger',
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
// Pressure Break: pure state machine and bounded trigger bank

export type PressureBreakPhase = 'charging' | 'armed' | 'break' | 'cooldown';

export interface PressureBreakConfig {
  maxHeat: number;
  proximityPadding: number;
  heatPerCloseEnemyPerS: number;
  maxHeatPerS: number;
  emptyDecayPerS: number;
  closeKillHeat: number;
  hitHeatLoss: number;
  bankSections: 1;
  existingProjectileSpeedMul: number;
  existingProjectileAgeMul: number;
  releaseDamageMul: number;
  cooldownS: number;
  maxTriggersPerRole: number;
  overflowPowerStep: number;
  maxMergedPower: number;
}

/** Locked Pressure Break contract. A "section" is exactly four beats. */
export const PRESSURE_BREAK_CONFIG: Readonly<PressureBreakConfig> = Object.freeze({
  maxHeat: 100,
  proximityPadding: 130,
  heatPerCloseEnemyPerS: 0.45,
  maxHeatPerS: 6,
  emptyDecayPerS: 3,
  closeKillHeat: 2,
  hitHeatLoss: 30,
  bankSections: 1,
  existingProjectileSpeedMul: 0.15,
  existingProjectileAgeMul: 0.15,
  releaseDamageMul: 1.15,
  cooldownS: 45,
  maxTriggersPerRole: 16,
  overflowPowerStep: 0.25,
  maxMergedPower: 3,
});

export interface PressureBreakState {
  phase: PressureBreakPhase;
  heat: number;
  /** Heat is full and the break is queued for the next four-beat boundary. */
  armPending: boolean;
  cooldownRemainingS: number;
  cycle: number;
  /** Monotonic section id last consumed; duplicate callbacks are ignored. */
  lastBoundarySerial: number;
  /** Section where banking began, or null outside a live break. */
  breakStartedBoundarySerial: number | null;
}

export type PressureBreakEvent =
  | 'armed'
  | 'break-started'
  | 'release-fired'
  | 'cooled-down';

export interface PressureBreakUpdate {
  state: PressureBreakState;
  events: readonly PressureBreakEvent[];
  heatRatePerS: number;
  shouldBankTriggers: boolean;
  /** Apply to already-flying projectiles while the break phase is active. */
  existingProjectileSpeedMul: number;
  existingProjectileAgeMul: number;
}

export interface PressureBreakInput {
  dtS: number;
  closeEnemyCount: number;
  /** Monotonic id of a crossed four-beat boundary; omit between boundaries. */
  fourBeatBoundary?: number;
}

export function createPressureBreakState(): PressureBreakState {
  return {
    phase: 'charging',
    heat: 0,
    armPending: false,
    cooldownRemainingS: 0,
    cycle: 0,
    lastBoundarySerial: -1,
    breakStartedBoundarySerial: null,
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

/** Taking a hit removes 30 heat. A queued/live break survives, matching RunWorld. */
export function applyPressureHit(previous: PressureBreakState): PressureBreakState {
  const heat = Math.max(0, previous.heat - PRESSURE_BREAK_CONFIG.hitHeatLoss);
  return {
    ...previous,
    heat,
    armPending: previous.phase === 'charging'
      ? heat >= PRESSURE_BREAK_CONFIG.maxHeat
      : previous.armPending,
  };
}

/** Begin banking at an armed boundary. Reusing that boundary id is a no-op. */
export function beginPressureBreak(
  previous: PressureBreakState,
  boundarySerial: number,
): PressureBreakUpdate {
  const serial = pressureBoundarySerial(boundarySerial);
  if (previous.phase !== 'armed' || serial <= previous.lastBoundarySerial) {
    return pressureUpdateResult(previous, [], 0);
  }
  const state: PressureBreakState = {
    ...previous,
    phase: 'break',
    armPending: false,
    cycle: previous.cycle + 1,
    lastBoundarySerial: serial,
    breakStartedBoundarySerial: serial,
  };
  return pressureUpdateResult(state, ['break-started'], 0);
}

/** Release the stored section at its ending boundary and start 45s cooldown. */
export function releasePressureBreak(
  previous: PressureBreakState,
  boundarySerial: number,
): PressureBreakUpdate {
  const serial = pressureBoundarySerial(boundarySerial);
  if (
    previous.phase !== 'break' ||
    previous.breakStartedBoundarySerial === null ||
    serial <= previous.breakStartedBoundarySerial ||
    serial <= previous.lastBoundarySerial
  ) {
    return pressureUpdateResult(previous, [], 0);
  }
  const state: PressureBreakState = {
    ...previous,
    phase: 'cooldown',
    heat: 0,
    armPending: false,
    cooldownRemainingS: PRESSURE_BREAK_CONFIG.cooldownS,
    lastBoundarySerial: serial,
    breakStartedBoundarySerial: null,
  };
  return pressureUpdateResult(state, ['release-fired'], 0);
}

/** Consume one unique four-beat boundary and perform its queued transition. */
export function advancePressureFourBeatBoundary(
  previous: PressureBreakState,
  boundarySerial: number,
): PressureBreakUpdate {
  const serial = pressureBoundarySerial(boundarySerial);
  if (serial <= previous.lastBoundarySerial) return pressureUpdateResult(previous, [], 0);
  if (previous.phase === 'armed') return beginPressureBreak(previous, serial);
  if (previous.phase === 'break') return releasePressureBreak(previous, serial);
  return pressureUpdateResult({ ...previous, lastBoundarySerial: serial }, [], 0);
}

/**
 * Advance heat/cooldown and consume four-beat boundaries. Full heat enters the
 * armed/queued phase immediately; the next boundary starts banking and the
 * following boundary releases, guaranteeing exactly one four-beat section.
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
      const lastBoundarySerial = state.lastBoundarySerial;
      state = {
        ...createPressureBreakState(),
        cycle: previous.cycle,
        lastBoundarySerial,
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
  if (input.fourBeatBoundary !== undefined) {
    const boundaryUpdate = advancePressureFourBeatBoundary(state, input.fourBeatBoundary);
    state = boundaryUpdate.state;
    events.push(...boundaryUpdate.events);
  }
  return pressureUpdateResult(state, events, heatRatePerS);
}

export interface PressureBankedTrigger<RoleId extends string, Trigger> {
  readonly role: RoleId;
  readonly capturedAtS: number;
  readonly sequence: number;
  /** Overflow folds into the newest role hit, from 1x up to exactly 3x. */
  readonly power: number;
  readonly trigger: Trigger;
}

export interface PressureTriggerBank<RoleId extends string, Trigger> {
  readonly byRole: Readonly<Partial<Record<RoleId, readonly PressureBankedTrigger<RoleId, Trigger>[]>>>;
  readonly total: number;
  readonly maxPerRole: number;
  readonly overflowPowerStep: number;
  readonly maxMergedPower: number;
  readonly nextSequence: number;
}

export interface PressureBankPush<RoleId extends string, Trigger> {
  readonly bank: PressureTriggerBank<RoleId, Trigger>;
  readonly merged: boolean;
  readonly entry: PressureBankedTrigger<RoleId, Trigger>;
}

export function createPressureTriggerBank<RoleId extends string, Trigger>(
  maxPerRole = PRESSURE_BREAK_CONFIG.maxTriggersPerRole,
  overflowPowerStep = PRESSURE_BREAK_CONFIG.overflowPowerStep,
  maxMergedPower = PRESSURE_BREAK_CONFIG.maxMergedPower,
): PressureTriggerBank<RoleId, Trigger> {
  const byRole = Object.freeze({}) as Partial<
      Record<RoleId, readonly PressureBankedTrigger<RoleId, Trigger>[]>
    >;
  return Object.freeze({
    byRole,
    total: 0,
    maxPerRole: Math.max(1, Math.floor(finiteOr(maxPerRole, 16))),
    overflowPowerStep: Math.max(0, finiteOr(overflowPowerStep, 0.25)),
    maxMergedPower: Math.max(1, finiteOr(maxMergedPower, 3)),
    nextSequence: 0,
  });
}

/**
 * Add one trigger without exceeding 16 stored hits for that role. Overflow
 * strengthens the role's newest stored attack by 0.25, capped at 3x, instead
 * of allocating an unbounded event.
 */
export function pushPressureTrigger<RoleId extends string, Trigger>(
  bank: PressureTriggerBank<RoleId, Trigger>,
  role: RoleId,
  capturedAtS: number,
  trigger: Trigger,
): PressureBankPush<RoleId, Trigger> {
  const byRole: Partial<Record<RoleId, readonly PressureBankedTrigger<RoleId, Trigger>[]>> = {
    ...bank.byRole,
  };
  let entry: PressureBankedTrigger<RoleId, Trigger> = Object.freeze({
    role,
    capturedAtS: Math.max(0, finiteOr(capturedAtS, 0)),
    sequence: bank.nextSequence,
    power: 1,
    trigger,
  });
  const own = [...(byRole[role] ?? [])];
  let merged = false;
  if (own.length < bank.maxPerRole) {
    own.push(entry);
  } else {
    const lastIndex = own.length - 1;
    const previous = own[lastIndex];
    entry = Object.freeze({
      ...previous,
      power: Math.min(bank.maxMergedPower, previous.power + bank.overflowPowerStep),
    });
    own[lastIndex] = entry;
    merged = true;
  }
  byRole[role] = Object.freeze(own);
  Object.freeze(byRole);
  const entries = orderedEntriesFromRecord(byRole);
  return Object.freeze({
    bank: Object.freeze({
      byRole,
      total: entries.length,
      maxPerRole: bank.maxPerRole,
      overflowPowerStep: bank.overflowPowerStep,
      maxMergedPower: bank.maxMergedPower,
      nextSequence: bank.nextSequence + 1,
    }),
    merged,
    // A detached frozen metadata object prevents callers from aliasing the
    // stored entry while still preserving the caller-owned trigger payload.
    entry: Object.freeze({ ...entry }),
  });
}

export interface PressureBankDrain<RoleId extends string, Trigger> {
  readonly bank: PressureTriggerBank<RoleId, Trigger>;
  readonly triggers: readonly PressureBankedTrigger<RoleId, Trigger>[];
}

/** Drain in original cross-role capture order and preserve the configured bounds. */
export function drainPressureTriggerBank<RoleId extends string, Trigger>(
  bank: PressureTriggerBank<RoleId, Trigger>,
): PressureBankDrain<RoleId, Trigger> {
  const byRole = Object.freeze({}) as Partial<
        Record<RoleId, readonly PressureBankedTrigger<RoleId, Trigger>[]>
      >;
  return Object.freeze({
    bank: Object.freeze({
      byRole,
      total: 0,
      maxPerRole: bank.maxPerRole,
      overflowPowerStep: bank.overflowPowerStep,
      maxMergedPower: bank.maxMergedPower,
      nextSequence: bank.nextSequence,
    }),
    triggers: Object.freeze(orderedBankEntries(bank)),
  });
}

export interface ScheduledPressureTrigger<RoleId extends string, Trigger>
  extends PressureBankedTrigger<RoleId, Trigger> {
  readonly releaseAtS: number;
  readonly damageMul: number;
}

/** Release together by default at 1.15 damage, multiplied by overflow power. */
export function schedulePressureRelease<RoleId extends string, Trigger>(
  triggers: readonly PressureBankedTrigger<RoleId, Trigger>[],
  startsAtS: number,
  spreadS = 0,
): readonly ScheduledPressureTrigger<RoleId, Trigger>[] {
  const start = Math.max(0, finiteOr(startsAtS, 0));
  const spread = Math.max(0, finiteOr(spreadS, 0));
  const ordered = [...triggers].sort((a, b) => a.sequence - b.sequence);
  return Object.freeze(ordered.map((entry, index) => Object.freeze({
      ...entry,
      releaseAtS: start + (ordered.length <= 1 ? 0 : (index / (ordered.length - 1)) * spread),
      damageMul: PRESSURE_BREAK_CONFIG.releaseDamageMul * entry.power,
    })));
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
  const lastBoundarySerial = Math.max(-1, Math.floor(finiteOr(state.lastBoundarySerial, -1)));
  const breakStartedBoundarySerial = state.breakStartedBoundarySerial === null
    ? null
    : Math.max(0, Math.floor(finiteOr(state.breakStartedBoundarySerial, 0)));
  return {
    phase: state.phase,
    heat: clampHeat(state.heat),
    armPending: state.armPending === true,
    cooldownRemainingS: Math.max(0, finiteOr(state.cooldownRemainingS, 0)),
    cycle: Math.max(0, Math.floor(finiteOr(state.cycle, 0))),
    lastBoundarySerial,
    breakStartedBoundarySerial,
  };
}

function pressureUpdateResult(
  state: PressureBreakState,
  events: readonly PressureBreakEvent[],
  heatRatePerS: number,
): PressureBreakUpdate {
  return {
    state,
    events,
    heatRatePerS,
    shouldBankTriggers: state.phase === 'break',
    existingProjectileSpeedMul: state.phase === 'break'
      ? PRESSURE_BREAK_CONFIG.existingProjectileSpeedMul
      : 1,
    existingProjectileAgeMul: state.phase === 'break'
      ? PRESSURE_BREAK_CONFIG.existingProjectileAgeMul
      : 1,
  };
}

function orderedEntriesFromRecord<RoleId extends string, Trigger>(
  byRole: Readonly<Partial<Record<RoleId, readonly PressureBankedTrigger<RoleId, Trigger>[]>>>,
): PressureBankedTrigger<RoleId, Trigger>[] {
  const entries: PressureBankedTrigger<RoleId, Trigger>[] = [];
  for (const role of Object.keys(byRole) as RoleId[]) {
    entries.push(...(byRole[role] ?? []));
  }
  return entries.sort((a, b) => a.sequence - b.sequence);
}

function orderedBankEntries<RoleId extends string, Trigger>(
  bank: PressureTriggerBank<RoleId, Trigger>,
): PressureBankedTrigger<RoleId, Trigger>[] {
  return orderedEntriesFromRecord(bank.byRole);
}
