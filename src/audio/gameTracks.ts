// Four development-only candidate tracks that can be built as weapons in a
// normal run. Track Lab remains the composition/source-of-truth surface; this
// module adapts each candidate's declared strongest section onto existing
// gameplay Roles, so combat effects and visuals are reused without widening
// RunWorld's weapon dispatch.

import { TIER_COUNT, type Chart, type ChartEvent } from './charts';
import { ROLE_META, type Kit, type Role } from './kits';
import { ANIMALS } from '../tracklab/tracks/animals';
import { PURSUIT } from '../tracklab/tracks/pursuit';
import { SATISFACTION } from '../tracklab/tracks/satisfaction';
import { SHOW_ME_LOVE } from '../tracklab/tracks/showmelove';
import type { LabChart, LabTrack, LabVoiceDef } from '../tracklab/tracks/types';

const STEPS_PER_BAR = 16;
const GAME_TRACK_MAX_BARS = 8;

export type GameTrackId = 'showmelove' | 'animals' | 'pursuit' | 'satisfaction';

export interface GameTrackWeapon {
  role: Role;
  /** Track Lab lane whose sound and final chart this weapon owns. */
  voiceId: string;
  gain: number;
  ducked: boolean;
  ducker: boolean;
  /** Compensates only gameplay damage for unusually dense authored parts. */
  damageMul: number;
  ladder: readonly [Chart, Chart, Chart, Chart];
}

export interface GameTrackProfile {
  id: GameTrackId;
  title: string;
  artist: string;
  bpm: number;
  swing: number;
  phraseBars: number;
  powerMul: number;
  /** One integer XP cost per remaining weapon state. Unlike the old flat
   *  multiplier, this preserves a quick first reward without turning every
   *  opening kill into another level. */
  xpCurve: readonly number[];
  /** Minimum active-combat time between pick screens. Earned XP stays banked. */
  levelGapS: number;
  pump?: { amount: number; release: number };
  humanizeGain: number;
  humanizeCents: number;
  roles: readonly Role[];
  startRole: Role;
  maxBuildLevel: number;
  finalSectionId: string;
  weapons: readonly GameTrackWeapon[];
  ladders: Readonly<Partial<Record<Role, readonly [Chart, Chart, Chart, Chart]>>>;
  buildKits(ctx: BaseAudioContext): Promise<Map<Role, Kit>>;
}

interface WeaponSpec {
  voiceId: string;
  role: Role;
  damageMul?: number;
  /** Levels I-III may open a filter/timbre while IV remains byte-for-byte the
   *  strongest section's chart. The suffix after ':' (Satisfaction glide) is
   *  retained. */
  tierVariants?: readonly [string | undefined, string | undefined, string | undefined];
}

interface ProfileSpec {
  track: LabTrack;
  finalSectionId: string;
  /** Total collectible XP represented by the full authored curve. */
  xpBudget: number;
  powerMul: number;
  weapons: readonly WeaponSpec[];
}

const AUDITION_LEVEL_GAP_S = 12;
const XP_CURVE_EXPONENT = 1.35;

/** Shape a complete-build XP budget into integer costs. The first kill earns
 *  one onboarding pick; the second costs three, then the curve keeps rising for
 *  the track's entire catalog instead of flattening at the legacy array tail. */
function auditionXpCurve(upgradeCount: number, budget: number): readonly number[] {
  if (!Number.isInteger(upgradeCount) || upgradeCount < 3) {
    throw new Error(`game tracks: invalid upgrade count ${upgradeCount}`);
  }
  if (!Number.isInteger(budget) || budget < 1) {
    throw new Error(`game tracks: invalid XP budget ${budget}`);
  }
  const curve = [1];
  const progressSpan = Math.max(1, upgradeCount - 2);
  let baseTotal = 1;
  let curveWeight = 0;
  for (let index = 1; index < upgradeCount; index++) {
    baseTotal += index === 1 ? 3 : 6 + 2 * (index - 1);
    curveWeight += Math.pow((index - 1) / progressSpan, XP_CURVE_EXPONENT);
  }
  const amplitude = (budget - baseTotal) / curveWeight;
  if (!Number.isFinite(amplitude) || amplitude < 0) {
    throw new Error(`game tracks: XP budget ${budget} is too small for ${upgradeCount} upgrades`);
  }
  for (let index = 1; index < upgradeCount; index++) {
    const progress = (index - 1) / progressSpan;
    curve.push(
      Math.round(
        (index === 1 ? 3 : 6 + 2 * (index - 1)) +
          amplitude * Math.pow(progress, XP_CURVE_EXPONENT),
      ),
    );
  }
  // Rounding is deterministic; put its tiny residual at the expensive end.
  curve[curve.length - 1] += budget - curve.reduce((sum, threshold) => sum + threshold, 0);
  if (curve.some((threshold, index) => threshold < 1 || (index > 0 && threshold < curve[index - 1]))) {
    throw new Error(`game tracks: invalid generated XP curve for budget ${budget}`);
  }
  return curve;
}

function cloneEvent(event: ChartEvent): ChartEvent {
  return { ...event };
}

function labChartAsRole(role: Role, chart: LabChart): Chart {
  return { role, bars: chart.bars, events: chart.events.map(cloneEvent) };
}

/** Grow onset groups across the whole phrase while preserving a basic pulse in
 *  every active drum/riff bar. Events sharing an onset stay together. Sparse
 *  phrase accents grow globally; denser repeated patterns seed each active bar
 *  and then add one evenly distributed layer at a time. */
function thinChart(chart: Chart, fraction: number, velocityMul: number): Chart {
  const byStep = new Map<number, ChartEvent[]>();
  for (const event of chart.events) {
    const group = byStep.get(event.step) ?? [];
    group.push(event);
    byStep.set(event.step, group);
  }
  const allSteps = [...byStep.keys()].sort((a, b) => a - b);
  const byBar = new Map<number, number[]>();
  for (const step of allSteps) {
    const bar = Math.floor(step / STEPS_PER_BAR);
    const steps = byBar.get(bar) ?? [];
    steps.push(step);
    byBar.set(bar, steps);
  }
  const activeBars = [...byBar.keys()].sort((a, b) => a - b);
  const averagePerActiveBar = allSteps.length / Math.max(1, activeBars.length);
  const wanted = Math.max(1, Math.min(allSteps.length, Math.round(allSteps.length * fraction)));
  const selected: number[] = [];

  if (averagePerActiveBar >= 1.75 && wanted >= activeBars.length) {
    // Seed each active bar with its strongest onset.
    for (const bar of activeBars) {
      const steps = byBar.get(bar)!;
      selected.push(
        steps.reduce((best, step) => {
          const strength = Math.max(...byStep.get(step)!.map((event) => event.velocity));
          const bestStrength = Math.max(...byStep.get(best)!.map((event) => event.velocity));
          return strength > bestStrength ? step : best;
        }, steps[0]),
      );
    }
    // Add remaining positions round-robin across bars, preventing early bars
    // from becoming dense while later bars stay empty.
    const remainingByBar = new Map(
      activeBars.map((bar) => [
        bar,
        byBar.get(bar)!.filter((step) => !selected.includes(step)),
      ]),
    );
    while (selected.length < wanted) {
      let added = false;
      for (const bar of activeBars) {
        const step = remainingByBar.get(bar)!.shift();
        if (step === undefined) continue;
        selected.push(step);
        added = true;
        if (selected.length >= wanted) break;
      }
      if (!added) break;
    }
  } else {
    // Sparse phrase accents: start with the strongest, then repeatedly choose
    // the onset furthest from the selected set for an audible whole-phrase arc.
    const first = allSteps.reduce((best, step) => {
      const strength = Math.max(...byStep.get(step)!.map((event) => event.velocity));
      const bestStrength = Math.max(...byStep.get(best)!.map((event) => event.velocity));
      return strength > bestStrength ? step : best;
    }, allSteps[0]);
    selected.push(first);
    while (selected.length < wanted) {
      const candidate = allSteps
        .filter((step) => !selected.includes(step))
        .sort((a, b) => {
          const distanceA = Math.min(...selected.map((step) => Math.abs(a - step)));
          const distanceB = Math.min(...selected.map((step) => Math.abs(b - step)));
          return distanceB - distanceA || a - b;
        })[0];
      if (candidate === undefined) break;
      selected.push(candidate);
    }
  }

  const selectedSet = new Set(selected);
  const events = allSteps.flatMap((step) =>
    selectedSet.has(step)
      ? byStep.get(step)!.map((event) => ({
          ...event,
          velocity: Math.max(0.01, Math.min(1, event.velocity * velocityMul)),
        }))
      : [],
  );
  return { role: chart.role, bars: chart.bars, events };
}

function replaceVariantBase(event: ChartEvent, base: string | undefined): ChartEvent {
  if (!base) return cloneEvent(event);
  if (!event.variant) return { ...event, variant: base };
  const colon = event.variant.indexOf(':');
  return {
    ...event,
    variant: colon >= 0 ? `${base}${event.variant.slice(colon)}` : base,
  };
}

function ladderFor(
  role: Role,
  finalChart: LabChart,
  variants?: WeaponSpec['tierVariants'],
): readonly [Chart, Chart, Chart, Chart] {
  const exact = labChartAsRole(role, finalChart);
  if (role === 'kick') {
    // The kick is the mandatory starting weapon. Preserve its complete
    // four-on-the-floor backbone at Identity tier so it can actually earn the
    // first XP; later levels grow filter brightness, weight, coverage, weapon
    // stats, and any authored non-quarter-note pickup in the final chart.
    const backbone = exact.events.filter((event) => event.step % 4 === 0);
    const scaled = (
      events: ChartEvent[],
      velocityMul: number,
      variant: string | undefined,
    ): Chart => ({
      role,
      bars: exact.bars,
      events: events.map((event) => ({
        ...replaceVariantBase(event, variant),
        velocity: Math.max(0.01, Math.min(1, event.velocity * velocityMul)),
      })),
    });
    return [
      scaled(backbone, 0.72, variants?.[0]),
      scaled(backbone, 0.84, variants?.[1]),
      scaled(exact.events, 0.93, variants?.[2]),
      exact,
    ];
  }
  const fractions = [0.34, 0.58, 0.8] as const;
  const velocityMuls = [0.72, 0.84, 0.93] as const;
  const early = fractions.map((fraction, index) => {
    const thinned = thinChart(exact, fraction, velocityMuls[index]);
    return {
      ...thinned,
      events: thinned.events.map((event) => replaceVariantBase(event, variants?.[index])),
    };
  }) as [Chart, Chart, Chart];
  return [early[0], early[1], early[2], exact];
}

function sameChart(a: Chart, b: Chart): boolean {
  return a.role === b.role && a.bars === b.bars && JSON.stringify(a.events) === JSON.stringify(b.events);
}

function validateChartShape(profileId: string, chart: Chart): void {
  if (!Number.isInteger(chart.bars) || chart.bars < 1 || chart.bars > GAME_TRACK_MAX_BARS) {
    throw new Error(`${profileId}/${chart.role}: chart bars must be 1-${GAME_TRACK_MAX_BARS}`);
  }
  const limit = chart.bars * STEPS_PER_BAR;
  if (chart.events.length === 0) throw new Error(`${profileId}/${chart.role}: silent tier`);
  for (const event of chart.events) {
    if (!Number.isInteger(event.step) || event.step < 0 || event.step >= limit) {
      throw new Error(`${profileId}/${chart.role}: invalid step ${event.step}`);
    }
    if (!Number.isFinite(event.velocity) || event.velocity <= 0 || event.velocity > 1) {
      throw new Error(`${profileId}/${chart.role}: invalid velocity ${event.velocity}`);
    }
    if (event.note !== undefined && !Number.isFinite(event.note)) {
      throw new Error(`${profileId}/${chart.role}: non-finite note`);
    }
  }
}

function makeProfile(spec: ProfileSpec): GameTrackProfile {
  const { track } = spec;
  const finalSection = track.sections.find((section) => section.id === spec.finalSectionId);
  if (!finalSection) throw new Error(`${track.id}: missing final section ${spec.finalSectionId}`);
  if (track.bars > GAME_TRACK_MAX_BARS) {
    throw new Error(`${track.id}: phrase exceeds ${GAME_TRACK_MAX_BARS} bars`);
  }

  const voiceById = new Map(track.voices.map((voice) => [voice.id, voice]));
  const roles = spec.weapons.map((weapon) => weapon.role);
  if (new Set(roles).size !== roles.length) throw new Error(`${track.id}: duplicate gameplay role`);
  if (!roles.includes('kick')) throw new Error(`${track.id}: kick must be the starting weapon`);

  const weapons = spec.weapons.map((weapon): GameTrackWeapon => {
    const voice = voiceById.get(weapon.voiceId);
    if (!voice) throw new Error(`${track.id}: missing voice ${weapon.voiceId}`);
    const finalChart = finalSection.charts[weapon.voiceId];
    if (!finalChart?.events.length) {
      throw new Error(`${track.id}: ${weapon.voiceId} is silent in ${spec.finalSectionId}`);
    }
    const ladder = ladderFor(weapon.role, finalChart, weapon.tierVariants);
    for (const chart of ladder) validateChartShape(track.id, chart);
    const exact = labChartAsRole(weapon.role, finalChart);
    if (!sameChart(ladder[TIER_COUNT - 1], exact)) {
      throw new Error(`${track.id}/${weapon.voiceId}: Level IV drifted from final section`);
    }
    return {
      role: weapon.role,
      voiceId: weapon.voiceId,
      gain: voice.gain ?? 1,
      ducked: voice.ducked ?? false,
      ducker: voice.ducker ?? false,
      damageMul: weapon.damageMul ?? 1,
      ladder,
    };
  });

  const ladders: Partial<Record<Role, readonly [Chart, Chart, Chart, Chart]>> = {};
  for (const weapon of weapons) ladders[weapon.role] = weapon.ladder;

  const kitCache = new WeakMap<BaseAudioContext, Promise<Map<Role, Kit>>>();
  const buildKits = (ctx: BaseAudioContext): Promise<Map<Role, Kit>> => {
    const cached = kitCache.get(ctx);
    if (cached) return cached;
    const promise = Promise.all(
      weapons.map(async (weapon): Promise<[Role, Kit]> => {
        const voice: LabVoiceDef = voiceById.get(weapon.voiceId)!;
        const samples = await voice.build(ctx);
        if (samples.size === 0) throw new Error(`${track.id}/${voice.id}: built no samples`);
        const variants = new Set(
          weapon.ladder.flatMap((chart) =>
            chart.events.map((event) => event.variant).filter((value): value is string => Boolean(value)),
          ),
        );
        for (const variant of variants) {
          if (!samples.has(variant)) {
            throw new Error(`${track.id}/${voice.id}: missing sample variant ${variant}`);
          }
        }
        const defaultVariant = voice.defaultVariant ?? samples.keys().next().value;
        if (!defaultVariant || !samples.has(defaultVariant)) {
          throw new Error(`${track.id}/${voice.id}: invalid default sample variant`);
        }
        return [
          weapon.role,
          {
            role: weapon.role,
            name: voice.name,
            // Combat effects use the canonical role color, so the HUD and the
            // reused on-field silhouette continue to describe the same weapon.
            color: ROLE_META[weapon.role].color,
            pitched: voice.pitched,
            choke: voice.choke,
            samples,
            defaultVariant,
            tune: voice.tune ?? 0,
          },
        ];
      }),
    ).then((entries) => new Map<Role, Kit>(entries));
    kitCache.set(ctx, promise);
    return promise;
  };

  const maxBuildLevel = roles.length * TIER_COUNT;
  const xpCurve = auditionXpCurve(maxBuildLevel - 1, spec.xpBudget);

  return {
    id: track.id as GameTrackId,
    title: track.title,
    artist: track.artist,
    bpm: track.bpm,
    swing: track.swing ?? 0,
    phraseBars: track.bars,
    powerMul: spec.powerMul,
    xpCurve,
    levelGapS: AUDITION_LEVEL_GAP_S,
    pump: track.pump,
    humanizeGain: track.humanizeGain ?? 0.06,
    humanizeCents: track.humanizeCents ?? 5,
    roles,
    startRole: 'kick',
    maxBuildLevel,
    finalSectionId: spec.finalSectionId,
    weapons,
    ladders,
    buildKits,
  };
}

export const SHOW_ME_LOVE_GAME = makeProfile({
  track: SHOW_ME_LOVE,
  finalSectionId: 'peak',
  xpBudget: 900,
  powerMul: 0.98,
  weapons: [
    { voiceId: 'kick', role: 'kick', tierVariants: ['muted', 'body', 'bright'] },
    { voiceId: 'clap', role: 'clap', tierVariants: ['muted', 'body', 'bright'] },
    { voiceId: 'hats', role: 'hat', damageMul: 0.85 },
    { voiceId: 'perc', role: 'rimshot', damageMul: 0.85 },
    { voiceId: 'fx', role: 'crash', tierVariants: ['muted', 'body', 'bright'] },
    { voiceId: 'organ', role: 'bass', damageMul: 0.42, tierVariants: ['warm', 'warm', 'bright'] },
    { voiceId: 'strings', role: 'chord', damageMul: 1.15 },
  ],
});

export const ANIMALS_GAME = makeProfile({
  track: ANIMALS,
  finalSectionId: 'peak',
  xpBudget: 830,
  powerMul: 0.9,
  weapons: [
    { voiceId: 'kick', role: 'kick', tierVariants: ['muted', 'body', 'bright'] },
    { voiceId: 'percussion', role: 'clap', tierVariants: ['muted', 'body', 'bright'] },
    { voiceId: 'hats', role: 'hat', damageMul: 0.9 },
    { voiceId: 'fx', role: 'crash', tierVariants: ['muted', 'body', 'bright'] },
    { voiceId: 'bass', role: 'bass', damageMul: 0.46 },
    { voiceId: 'hook', role: 'lead', damageMul: 0.58, tierVariants: ['wood', 'wood', 'bite'] },
  ],
});

export const PURSUIT_GAME = makeProfile({
  track: PURSUIT,
  finalSectionId: 'dropvar',
  xpBudget: 839,
  powerMul: 1.02,
  weapons: [
    { voiceId: 'kick', role: 'kick', tierVariants: ['muted', 'body', 'bright'] },
    { voiceId: 'clap', role: 'clap', tierVariants: ['muted', 'body', 'bright'] },
    { voiceId: 'hats', role: 'hat', damageMul: 0.62 },
    { voiceId: 'bass', role: 'bass', damageMul: 0.3 },
    { voiceId: 'stab', role: 'lead', damageMul: 0.43 },
  ],
});

export const SATISFACTION_GAME = makeProfile({
  track: SATISFACTION,
  finalSectionId: 'drop',
  xpBudget: 782,
  powerMul: 0.88,
  weapons: [
    { voiceId: 'kick', role: 'kick', tierVariants: ['muted', 'body', 'bright'] },
    { voiceId: 'clap', role: 'clap', tierVariants: ['muted', 'body', 'bright'] },
    { voiceId: 'hats', role: 'hat', damageMul: 0.72 },
    { voiceId: 'fx', role: 'crash', tierVariants: ['muted', 'body', 'bright'] },
    {
      voiceId: 'bass',
      role: 'bass',
      damageMul: 0.34,
      tierVariants: ['muffled', 'mid', 'open'],
    },
    {
      voiceId: 'lead',
      role: 'lead',
      damageMul: 0.34,
      tierVariants: ['muffled', 'mid', 'open'],
    },
  ],
});

export const GAME_TRACKS = [
  SHOW_ME_LOVE_GAME,
  ANIMALS_GAME,
  PURSUIT_GAME,
  SATISFACTION_GAME,
] as const satisfies readonly GameTrackProfile[];

export const GAME_TRACK_BY_ID: Readonly<Record<GameTrackId, GameTrackProfile>> =
  Object.fromEntries(GAME_TRACKS.map((track) => [track.id, track])) as Record<
    GameTrackId,
    GameTrackProfile
  >;

if (GAME_TRACKS.length !== 4 || new Set(GAME_TRACKS.map((track) => track.id)).size !== 4) {
  throw new Error('game tracks: expected exactly four unique candidates');
}
