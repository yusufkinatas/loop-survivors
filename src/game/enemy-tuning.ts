// The enemy lab's data layer: a live, per-kind override of the shipped numbers
// in ENEMIES, so speed/size/health/damage/XP/knockback can be dialled in while
// the horde is on screen and then exported back into config.ts as source.
//
// Overrides are GLOBAL and PERSISTENT — a tuned kind stays tuned in ordinary
// runs and across reloads. That is the point: you tune in the sandbox, then
// play a real run to feel it. The cost is that a forgotten override silently
// changes what a run means, so anything reporting balance must say when tuning
// is live (see tunedKindCount, the panel banner, and the boot warning below).

import {
  ENEMIES,
  ENEMY_SPEED_UNIT,
  ENEMY_LABELS,
  MAD_FOREST_FRAMES,
  madForestEnemyStats,
  type EnemyConf,
  type EnemyKind,
} from './config';

/** The editable fields. `sizeMul` is a multiplier because frame-backed kinds
 *  have no single authored radius; every other key is an absolute base value,
 *  identical in meaning to the field of the same name in ENEMIES. */
export type TunableKey = 'hp' | 'speed' | 'sizeMul' | 'damage' | 'xp' | 'knockback';

type EnemyOverride = Partial<Record<TunableKey, number>>;

export interface TunableField {
  key: TunableKey;
  label: string;
  /** Slider ceiling as a multiple of the shipped value, and a floor ceiling so
   *  a kind whose shipped value is 0 or 1 still gets a usable range. */
  span: number;
  minSpan: number;
  /** Sliders are integer-stepped on stats the game authors as whole numbers. */
  integral: boolean;
  hint: string;
}

/** Ordered as the panel renders them: the three the request named first. */
export const TUNABLE_FIELDS: readonly TunableField[] = [
  { key: 'hp', label: 'health', span: 5, minSpan: 20, integral: true, hint: 'base HP, before HP×Level on the kinds that carry it' },
  { key: 'speed', label: 'speed', span: 3, minSpan: 120, integral: false, hint: 'px/s — never scales, at any minute' },
  { key: 'sizeMul', label: 'size', span: 4, minSpan: 4, integral: false, hint: 'body scale — hitbox and sprite together' },
  { key: 'damage', label: 'damage', span: 4, minSpan: 20, integral: true, hint: 'contact Power, before the player’s armor' },
  { key: 'xp', label: 'xp', span: 4, minSpan: 10, integral: false, hint: 'gem value dropped on death' },
  { key: 'knockback', label: 'knockback', span: 3, minSpan: 3, integral: false, hint: '0 shrugs off every shove, 1 takes it fully' },
];

const STORAGE_KEY = 'loop-survivors.enemy-tuning.v1';

const overrides = new Map<EnemyKind, EnemyOverride>();

/** The shipped value of one field — the slider's origin and the "is this kind
 *  modified" comparison. sizeMul is 1 unless a committed conf says otherwise. */
export function shippedValue(kind: EnemyKind, key: TunableKey): number {
  const conf = ENEMIES[kind];
  switch (key) {
    case 'hp': return conf.hp;
    case 'speed': return conf.speed;
    case 'sizeMul': return conf.sizeMul ?? 1;
    // Power is the real contact number; `damage` is only the fallback for the
    // pre-bestiary kinds that never got one.
    case 'damage': return conf.power ?? conf.damage;
    case 'xp': return conf.xp;
    case 'knockback': return conf.knockback ?? 1;
  }
}

export function tunedValue(kind: EnemyKind, key: TunableKey): number {
  return overrides.get(kind)?.[key] ?? shippedValue(kind, key);
}

/** Slider bounds for one kind's field. Anchored to the shipped value so every
 *  row has useful resolution whether the number is 1 or 500.
 *
 *  The span is a comfortable DRAGGING range, never a limit on the value: type
 *  a bigger number in the box and the slider grows to reach it. A tool that
 *  quietly clamped a typed 40 down to 25 would be lying about the build being
 *  tested. */
export function fieldRange(kind: EnemyKind, field: TunableField): { min: number; max: number; step: number } {
  const shipped = shippedValue(kind, field.key);
  const current = tunedValue(kind, field.key);
  const max = Math.max(shipped * field.span, field.minSpan, current);
  // sizeMul is the one field where 0 is meaningless (a bodiless enemy).
  const min = field.key === 'sizeMul' ? 0.2 : 0;
  const step = field.integral && max >= 20 ? 1 : Math.max(0.01, roundStep((max - min) / 100));
  return { min, max, step };
}

/** Keep steps on readable increments (0.01/0.02/0.05/0.1/…) so a dragged
 *  slider lands on numbers worth writing into config.ts. */
function roundStep(raw: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / magnitude;
  const nice = normalized >= 5 ? 5 : normalized >= 2 ? 2 : 1;
  return nice * magnitude;
}

/** The absolute ceiling on any tuned value. Not a balance judgement — just a
 *  guard so a fat-fingered exponent cannot put NaN-adjacent numbers into the
 *  simulation and hang a frame. */
const TUNING_CEILING = 1e6;

export function setTuning(kind: EnemyKind, key: TunableKey, value: number): void {
  // Only the floor is enforced: the slider's ceiling is a dragging convenience
  // (see fieldRange), not a cap on what the designer may commit.
  const min = key === 'sizeMul' ? 0.2 : 0;
  const clamped = Math.min(TUNING_CEILING, Math.max(min, value));
  const entry = overrides.get(kind) ?? {};
  // Storing a value equal to the shipped one would mark the kind modified and
  // print a no-op line in the export, so it is dropped instead.
  if (clamped === shippedValue(kind, key)) delete entry[key];
  else entry[key] = clamped;
  if (Object.keys(entry).length === 0) overrides.delete(kind);
  else overrides.set(kind, entry);
  save();
}

/** Drop every override for one kind, or for the whole roster when kind is null. */
export function resetTuning(kind: EnemyKind | null): void {
  if (kind === null) overrides.clear();
  else overrides.delete(kind);
  save();
}

/** Put one field back to its shipped value, leaving the kind's other edits
 *  alone — the usual move when a slider turned out to be the wrong lever. */
export function resetTuningField(kind: EnemyKind, key: TunableKey): void {
  const entry = overrides.get(kind);
  if (!entry) return;
  delete entry[key];
  if (Object.keys(entry).length === 0) overrides.delete(kind);
  save();
}

/** Whether one field specifically differs from its shipped value. */
export function isFieldTuned(kind: EnemyKind, key: TunableKey): boolean {
  return overrides.get(kind)?.[key] !== undefined;
}

export function isTuned(kind: EnemyKind): boolean {
  return overrides.has(kind);
}

export function tunedKindCount(): number {
  return overrides.size;
}

/** The conf RunWorld should actually spawn from: shipped fields with any
 *  override laid over the top. */
function tunedConf(kind: EnemyKind): EnemyConf {
  const conf = ENEMIES[kind];
  const entry = overrides.get(kind);
  if (!entry) return conf;
  const next: EnemyConf = { ...conf };
  if (entry.hp !== undefined) next.hp = entry.hp;
  if (entry.speed !== undefined) next.speed = entry.speed;
  if (entry.sizeMul !== undefined) next.sizeMul = entry.sizeMul;
  if (entry.xp !== undefined) next.xp = entry.xp;
  if (entry.knockback !== undefined) next.knockback = entry.knockback;
  if (entry.damage !== undefined) {
    // madForestEnemyStats reads power first, so writing only `damage` on a
    // bestiary kind would be silently ignored.
    if (conf.power !== undefined) next.power = entry.damage;
    else next.damage = entry.damage;
  }
  return next;
}

/** Spawn-time stats with tuning applied — RunWorld's single entry point.
 *  Level scaling and the power/damage rule stay in one place by running the
 *  tuned conf back through the shipped derivation. */
export function enemyStats(kind: EnemyKind, playerLevel: number) {
  const conf = tunedConf(kind);
  return { ...madForestEnemyStats(conf, playerLevel), sizeMul: conf.sizeMul ?? 1 };
}

// ---------------------------------------------------------------------------
// Export: tuned kinds printed as pasteable config.ts source.

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)));
}

/** Frame-backed kinds author speed as `<n> * ENEMY_SPEED_UNIT`; printing a
 *  bare float there would lose the unit the whole bestiary is written in. */
function formatSpeed(kind: EnemyKind, value: number): string {
  if (!MAD_FOREST_FRAMES[kind]) return formatNumber(value);
  return `${formatNumber(Number((value / ENEMY_SPEED_UNIT).toFixed(2)))} * ENEMY_SPEED_UNIT`;
}

/** A config.ts-shaped block for every tuned kind, ready to paste into ENEMIES.
 *  Only changed fields are printed: the intent is a diff you can read, not a
 *  wholesale rewrite of entries you did not touch. */
export function exportTuning(): string {
  if (overrides.size === 0) return '// No enemy tuning to export — every kind is at its shipped values.';
  const lines: string[] = [
    '// Enemy lab export. Paste each field into the matching ENEMIES entry in',
    '// src/game/config.ts, then clear the lab so runs read the committed values.',
  ];
  for (const [kind, entry] of overrides) {
    lines.push('', `// ${ENEMY_LABELS[kind]}`, `${kind}: {`);
    for (const field of TUNABLE_FIELDS) {
      const value = entry[field.key];
      if (value === undefined) continue;
      const shipped = shippedValue(kind, field.key);
      const was = field.key === 'speed' ? formatSpeed(kind, shipped) : formatNumber(shipped);
      if (field.key === 'speed') lines.push(`  speed: ${formatSpeed(kind, value)}, // was ${was}`);
      else if (field.key === 'damage') {
        const name = ENEMIES[kind].power !== undefined ? 'power' : 'damage';
        lines.push(`  ${name}: ${formatNumber(value)}, // was ${was}`);
      } else lines.push(`  ${field.key}: ${formatNumber(value)}, // was ${was}`);
    }
    lines.push('},');
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Persistence. Storage failures are never fatal: a lab that cannot save is
// still a lab that tunes.

function save(): void {
  try {
    if (overrides.size === 0) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(overrides)));
  } catch {
    // Private-mode or quota: keep the in-memory tuning, lose only the reload.
  }
}

function load(): void {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return;
  }
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw) as Record<string, EnemyOverride>;
    for (const [kind, entry] of Object.entries(parsed)) {
      // Kinds and keys are validated on the way in: a stale save from before a
      // roster change must not smuggle a phantom kind into the panel.
      if (!(kind in ENEMIES)) continue;
      const clean: EnemyOverride = {};
      for (const field of TUNABLE_FIELDS) {
        const value = entry[field.key];
        if (typeof value === 'number' && Number.isFinite(value)) clean[field.key] = value;
      }
      if (Object.keys(clean).length > 0) overrides.set(kind as EnemyKind, clean);
    }
  } catch {
    return;
  }
  if (overrides.size > 0) {
    console.warn(
      `[enemy lab] ${overrides.size} enemy kind(s) are running on tuned stats, not shipped ones: ` +
        `${[...overrides.keys()].join(', ')}. Clear them in the sandbox → Enemies tab.`,
    );
  }
}

load();
