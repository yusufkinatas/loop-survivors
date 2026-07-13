/** Canonical Dev Campus catalogs.
 *
 * These lists are deliberately assembled from production registries wherever
 * production already owns the truth. A Zoo or Gym may add presentation, but
 * it must not keep a second list of weapons, slots, enemies, stage beats, or
 * effects. Status is data so dormant and experimental content cannot acquire
 * production meaning merely by appearing in search results.
 */

import { ROLE_META, type Role } from '../audio/kits';
import { supportedRoles } from '../audio/soundset';
import {
  ROLE_SLOT,
  SLOT_LABEL,
  SLOT_ROSTER,
  SLOTS,
  type Slot,
} from '../game/band';
import {
  CURRENT_ENEMY_KINDS,
  ENEMIES,
  ENEMY_LABELS,
  LEGACY_ENEMY_KINDS,
  TIER_LINES,
  WEAPONS,
  type EnemyKind,
} from '../game/config';
import { STAGE_EVENTS, STAGE_STARTING_SPAWNS, STAGE_WAVES } from '../game/madforest';
import { FX_EVENT_TYPES } from '../game/run';
import { BOSSES } from '../boss/bosses';
import { TRACKS } from '../tracklab/tracks';
import type { DevStatus } from './types';

export interface StatusDefinition {
  status: DevStatus;
  label: string;
  meaning: string;
  launchable: boolean;
}

export const STATUS_CATALOG: readonly StatusDefinition[] = [
  { status: 'CURRENT', label: 'Current', meaning: 'Production behavior used by the current game.', launchable: true },
  { status: 'EXPERIMENTAL', label: 'Experimental', meaning: 'A working prototype outside the normal run; no production decision is implied.', launchable: true },
  { status: 'DORMANT', label: 'Dormant', meaning: 'Retained and inspectable, but not offered or used by the current game.', launchable: true },
  { status: 'HISTORICAL', label: 'Historical', meaning: 'Preserved to explain superseded work; never a current source of truth.', launchable: true },
  { status: 'PARKED', label: 'Parked', meaning: 'A named future surface with no mechanics until its locked phase specification exists.', launchable: false },
  { status: 'REMOVED', label: 'Removed', meaning: 'Intentionally deleted production behavior, retained only as a status record.', launchable: false },
] as const;

export interface BandSlotCatalogEntry {
  id: Slot;
  label: string;
  status: 'CURRENT';
  roles: readonly Role[];
}

export const BAND_SLOT_CATALOG: readonly BandSlotCatalogEntry[] = SLOTS.map((slot) => ({
  id: slot,
  label: SLOT_LABEL[slot],
  status: 'CURRENT' as const,
  roles: SLOT_ROSTER[slot],
}));

export interface WeaponCatalogEntry {
  role: Role;
  name: string;
  color: string;
  slot: Slot;
  slotLabel: string;
  status: 'CURRENT';
  tiers: NonNullable<(typeof WEAPONS)[Role]>;
  tierLines: readonly string[];
}

/** The only roles legal in current builds and offers. */
export const ACTIVE_WEAPON_CATALOG: readonly WeaponCatalogEntry[] = supportedRoles().map((role) => {
  const slot = ROLE_SLOT[role];
  const tiers = WEAPONS[role];
  const tierLines = TIER_LINES[role];
  if (!slot || !tiers || !tierLines) {
    throw new Error(`Dev Campus: supported weapon ${role} lacks slot, stats, or tier copy`);
  }
  return {
    role,
    name: ROLE_META[role].name,
    color: ROLE_META[role].color,
    slot,
    slotLabel: SLOT_LABEL[slot],
    status: 'CURRENT' as const,
    tiers,
    tierLines,
  };
});

export const ACTIVE_WEAPON_ROLES: readonly Role[] = ACTIVE_WEAPON_CATALOG.map(({ role }) => role);

export interface DormantAudioEntry {
  role: 'crash' | 'riser';
  name: string;
  color: string;
  status: 'DORMANT';
  gameplayStatus: 'REMOVED';
  note: string;
}

/** These voices remain audible in tooling, but have no slot, stats, glyph, or offer. */
export const DORMANT_AUDIO_CATALOG: readonly DormantAudioEntry[] = (['crash', 'riser'] as const).map((role) => ({
  role,
  name: ROLE_META[role].name,
  color: ROLE_META[role].color,
  status: 'DORMANT' as const,
  gameplayStatus: 'REMOVED' as const,
  note: `${ROLE_META[role].name} is audio-only; its former FX-slot weapon is removed.`,
}));

export interface EnemyCatalogEntry {
  kind: EnemyKind;
  name: string;
  status: 'CURRENT' | 'HISTORICAL';
  roster: 'mad-forest' | 'legacy-pre-parity';
  stats: (typeof ENEMIES)[EnemyKind];
}

function enemyEntry(kind: EnemyKind, status: EnemyCatalogEntry['status'], roster: EnemyCatalogEntry['roster']): EnemyCatalogEntry {
  return {
    kind,
    name: ENEMY_LABELS[kind] ?? kind.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`),
    status,
    roster,
    stats: ENEMIES[kind],
  };
}

export const CURRENT_ENEMY_CATALOG: readonly EnemyCatalogEntry[] = CURRENT_ENEMY_KINDS.map((kind) =>
  enemyEntry(kind, 'CURRENT', 'mad-forest'),
);

export const LEGACY_ENEMY_CATALOG: readonly EnemyCatalogEntry[] = LEGACY_ENEMY_KINDS.map((kind) =>
  enemyEntry(kind, 'HISTORICAL', 'legacy-pre-parity'),
);

export interface FxCatalogEntry {
  type: (typeof FX_EVENT_TYPES)[number];
  status: 'CURRENT';
  family: 'world' | 'combat' | 'camera';
}

const CAMERA_FX = new Set<(typeof FX_EVENT_TYPES)[number]>(['shake', 'flash']);
const COMBAT_FX = new Set<(typeof FX_EVENT_TYPES)[number]>(['whip', 'arc', 'dmg', 'spark', 'slam']);

export const FX_CATALOG: readonly FxCatalogEntry[] = FX_EVENT_TYPES.map((type) => ({
  type,
  status: 'CURRENT' as const,
  family: CAMERA_FX.has(type) ? 'camera' : COMBAT_FX.has(type) ? 'combat' : 'world',
}));

export interface UiStateCatalogEntry {
  id: string;
  label: string;
  status: 'CURRENT' | 'EXPERIMENTAL';
  owner: 'shell' | 'hud' | 'overlay' | 'dev' | 'boss';
  source: string;
}

/** Canonical states that the UI Zoo must render. Compound states are explicit
 * because pause/reward/overlays are shell flags rather than Game State values. */
export const UI_STATE_CATALOG: readonly UiStateCatalogEntry[] = [
  { id: 'start', label: 'Start and developer disclosure', status: 'CURRENT', owner: 'shell', source: 'src/game/game.ts' },
  { id: 'run-empty-rack', label: 'Run HUD, empty rack', status: 'CURRENT', owner: 'hud', source: 'src/game/hud.ts' },
  { id: 'run-full-rack', label: 'Run HUD, full seven-slot rack', status: 'CURRENT', owner: 'hud', source: 'src/game/hud.ts' },
  { id: 'run-muted-rack', label: 'Run HUD, muted slot', status: 'CURRENT', owner: 'hud', source: 'src/game/hud.ts' },
  { id: 'paused', label: 'Paused run', status: 'CURRENT', owner: 'shell', source: 'src/game/game.ts' },
  { id: 'ground-reward', label: 'Diegetic level-up choices', status: 'CURRENT', owner: 'shell', source: 'src/game/game.ts' },
  { id: 'death', label: 'Death result', status: 'CURRENT', owner: 'hud', source: 'src/game/hud.ts' },
  { id: 'victory', label: 'Victory result', status: 'CURRENT', owner: 'hud', source: 'src/game/hud.ts' },
  { id: 'sandbox', label: 'Sandbox panel', status: 'CURRENT', owner: 'dev', source: 'src/game/sandbox.ts' },
  { id: 'replay', label: 'Replay controls', status: 'CURRENT', owner: 'shell', source: 'src/game/game.ts' },
  { id: 'track-overlay', label: 'Now-playing overlay', status: 'CURRENT', owner: 'overlay', source: 'src/game/trackoverlay.ts' },
  { id: 'debug-overlay', label: 'Debug controls', status: 'CURRENT', owner: 'dev', source: 'src/game/game.ts' },
  { id: 'performance-overlay', label: 'Performance counters', status: 'CURRENT', owner: 'dev', source: 'src/game/game.ts' },
  { id: 'toast', label: 'Transient notification', status: 'CURRENT', owner: 'hud', source: 'src/game/hud.ts' },
  { id: 'boss-hud', label: 'Experimental boss HUD', status: 'EXPERIMENTAL', owner: 'boss', source: 'src/boss/page.ts' },
] as const;

export interface StageCatalogEntry {
  id: string;
  atS: number;
  status: 'CURRENT';
  kind: 'starting-population' | 'wave' | 'boss' | 'bat-sweep' | 'flower-wall';
  data: unknown;
}

export const STAGE_CATALOG: readonly StageCatalogEntry[] = [
  { id: 'start-population', atS: 0, status: 'CURRENT' as const, kind: 'starting-population' as const, data: { count: STAGE_STARTING_SPAWNS, enemy: 'redBat2' } },
  ...STAGE_WAVES.map((wave, index) => ({ id: `wave-${index}-${wave.atS}`, atS: wave.atS, status: 'CURRENT' as const, kind: 'wave' as const, data: wave })),
  ...STAGE_EVENTS.map((event, index) => ({
    id: `event-${index}-${event.atS}-${event.type}`,
    atS: event.atS,
    status: 'CURRENT' as const,
    kind: event.type === 'batSweep' ? 'bat-sweep' as const : event.type === 'flowerWall' ? 'flower-wall' as const : 'boss' as const,
    data: event,
  })),
].sort((a, b) => a.atS - b.atS);

export interface ExperimentCatalogEntry {
  id: string;
  name: string;
  status: 'EXPERIMENTAL' | 'HISTORICAL';
  family: 'track-lab' | 'boss-fight';
  source: string;
  note: string;
}

export const EXPERIMENT_CATALOG: readonly ExperimentCatalogEntry[] = [
  ...TRACKS.map((track) => ({
    id: `track-${track.id}`,
    name: track.title,
    status: 'HISTORICAL' as const,
    family: 'track-lab' as const,
    source: 'src/tracklab/tracks/index.ts',
    note: 'Cover/research material; not a current game track or build source of truth.',
  })),
  ...BOSSES.map((boss) => ({
    id: `boss-${boss.id}`,
    name: boss.name,
    status: 'EXPERIMENTAL' as const,
    family: 'boss-fight' as const,
    source: 'src/boss/bosses.ts',
    note: 'Standalone experiment; not integrated into the normal run.',
  })),
];

export interface SystemStatusEntry {
  id: string;
  label: string;
  status: DevStatus;
  note: string;
  source: string;
}

export const SYSTEM_STATUS_CATALOG: readonly SystemStatusEntry[] = [
  { id: 'seven-slot-band', label: 'Seven-slot, fourteen-weapon band', status: 'CURRENT', note: 'Two current weapons compete for each permanent slot.', source: 'src/game/band.ts' },
  { id: 'mad-forest-stage', label: 'Mad Forest eight-minute parity stage', status: 'CURRENT', note: 'Current stage and enemy roster.', source: 'src/game/madforest.ts' },
  { id: 'diegetic-rewards', label: 'Ground level-up choices', status: 'CURRENT', note: 'Three physical choices replace the removed pause menu.', source: 'src/game/game.ts' },
  { id: 'crash-riser-audio', label: 'Crash and riser audio', status: 'DORMANT', note: 'Auditionable audio only; never gameplay weapons.', source: 'src/audio/kits.ts' },
  { id: 'legacy-enemies', label: 'Pre-parity enemies', status: 'HISTORICAL', note: 'Retained for old replay and comparison fixtures.', source: 'src/game/config.ts' },
  { id: 'track-lab', label: 'Track Lab covers', status: 'HISTORICAL', note: 'Research and cover experiments, not production tracks.', source: 'src/tracklab/tracks/index.ts' },
  { id: 'boss-fights', label: 'Boss fights and conductor', status: 'EXPERIMENTAL', note: 'Standalone prototype with no normal-run integration.', source: 'src/boss/bosses.ts' },
  { id: 'genres', label: 'Genre selection', status: 'REMOVED', note: 'The game now uses one fixed soundset.', source: 'docs/STATUS.md' },
  { id: 'full-track-drop', label: 'Full-track drop direction', status: 'REMOVED', note: 'Superseded by emergent music from the build.', source: 'docs/plan.md' },
  { id: 'passive-items', label: 'Passive items and weapon effects', status: 'REMOVED', note: 'Removed during the catalog overhaul.', source: 'docs/STATUS.md' },
  { id: 'fx-weapons', label: 'FX slot and crash/riser weapons', status: 'REMOVED', note: 'Audio remains dormant; weapon mechanics and slot are gone.', source: 'docs/STATUS.md' },
  { id: 'boss-integration', label: 'Boss integration', status: 'PARKED', note: 'Requires a future locked phase decision.', source: 'docs/plan.md' },
  { id: 'stage-music-hooks', label: 'Stage music hooks', status: 'PARKED', note: 'Reserved by architecture, not implemented.', source: 'docs/plan.md' },
  { id: 'tempo-progression', label: 'Tempo progression', status: 'PARKED', note: 'Not resolved ad hoc in tooling.', source: 'docs/plan.md' },
  { id: 'instrument-swapping', label: 'Mid-run instrument swapping', status: 'PARKED', note: 'Deliberately absent from the permanent-slot build.', source: 'docs/plan.md' },
  { id: 'visual-style', label: 'Final visual style', status: 'PARKED', note: 'Decision gate belongs to M4.', source: 'docs/plan.md' },
] as const;

export interface SourceCatalogEntry {
  id: string;
  label: string;
  path: string;
  status: DevStatus;
  owns: readonly string[];
}

export const SOURCE_CATALOG: readonly SourceCatalogEntry[] = [
  { id: 'roles', label: 'Role identity', path: 'src/audio/kits.ts', status: 'CURRENT', owns: ['role names', 'colors', 'sample variants'] },
  { id: 'soundset', label: 'Supported soundset', path: 'src/audio/soundset.ts', status: 'CURRENT', owns: ['supported weapons', 'tempo', 'swing', 'timing ladders'] },
  { id: 'band', label: 'Band slots', path: 'src/game/band.ts', status: 'CURRENT', owns: ['slot order', 'labels', 'slot rosters', 'offer nudge'] },
  { id: 'weapons', label: 'Weapon tiers', path: 'src/game/config.ts', status: 'CURRENT', owns: ['weapon stats', 'tier descriptions'] },
  { id: 'enemies', label: 'Enemy stats and roster status', path: 'src/game/config.ts', status: 'CURRENT', owns: ['current enemies', 'legacy enemies', 'enemy stats'] },
  { id: 'stage', label: 'Stage schedule', path: 'src/game/madforest.ts', status: 'CURRENT', owns: ['stage waves', 'events', 'starting population'] },
  { id: 'picks', label: 'Offer rules', path: 'src/game/picks.ts', status: 'CURRENT', owns: ['offer eligibility', 'weights', 'tier upgrades', 'heal fallback'] },
  { id: 'patterns', label: 'Timing patterns', path: 'src/audio/ladders/house.ts', status: 'CURRENT', owns: ['four timing tiers per active weapon'] },
  { id: 'engine', label: 'Audio scheduling and mix', path: 'src/audio/engine.ts', status: 'CURRENT', owns: ['lookahead', 'voices', 'gain path', 'heard-time queue'] },
  { id: 'world', label: 'World simulation and FX requests', path: 'src/game/run.ts', status: 'CURRENT', owns: ['combat mechanics', 'entities', 'FX events'] },
  { id: 'view', label: 'World rendering', path: 'src/game/view.ts', status: 'CURRENT', owns: ['Pixi entity views', 'cosmetic feedback'] },
  { id: 'shell', label: 'Run shell and reward lifecycle', path: 'src/game/game.ts', status: 'CURRENT', owns: ['run states', 'ground rewards', 'time composition', 'replay shell'] },
  { id: 'bot', label: 'Headless bot and virtual conductor', path: 'src/bot', status: 'CURRENT', owns: ['headless policies', 'fixed-step conductor', 'batch metrics'] },
  { id: 'status', label: 'Current project status', path: 'docs/STATUS.md', status: 'CURRENT', owns: ['current gate', 'latest implementation state', 'supersession warnings'] },
  { id: 'plan', label: 'Design rationale and parked decisions', path: 'docs/plan.md', status: 'CURRENT', owns: ['pillars', 'architecture', 'parked decisions'] },
  { id: 'parity-reference', label: 'Mad Forest evidence', path: 'docs/research/mad-forest-reference.md', status: 'CURRENT', owns: ['reference versions', 'adopted values', 'inferences'] },
  { id: 'track-lab-source', label: 'Track Lab experiments', path: 'src/tracklab/tracks/index.ts', status: 'HISTORICAL', owns: ['cover experiment registry'] },
  { id: 'boss-source', label: 'Boss experiments', path: 'src/boss/bosses.ts', status: 'EXPERIMENTAL', owns: ['boss prototypes', 'arrangements', 'attack grammar'] },
] as const;

function assertUnique<T>(label: string, entries: readonly T[], key: (entry: T) => string): void {
  const ids = entries.map(key);
  if (new Set(ids).size !== ids.length) throw new Error(`Dev Campus: duplicate ${label}`);
}

function assertCatalogIntegrity(): void {
  if (BAND_SLOT_CATALOG.length !== 7) throw new Error(`Dev Campus: expected 7 current slots, got ${BAND_SLOT_CATALOG.length}`);
  if (ACTIVE_WEAPON_CATALOG.length !== 14) throw new Error(`Dev Campus: expected 14 current weapons, got ${ACTIVE_WEAPON_CATALOG.length}`);
  if (CURRENT_ENEMY_CATALOG.length !== 12) throw new Error(`Dev Campus: expected 12 current enemies, got ${CURRENT_ENEMY_CATALOG.length}`);
  if (LEGACY_ENEMY_CATALOG.length !== 8) throw new Error(`Dev Campus: expected 8 legacy enemies, got ${LEGACY_ENEMY_CATALOG.length}`);
  if (DORMANT_AUDIO_CATALOG.map(({ role }) => role).join(',') !== 'crash,riser') throw new Error('Dev Campus: dormant audio must be exactly crash and riser');
  for (const slot of BAND_SLOT_CATALOG) {
    const activeInSlot = ACTIVE_WEAPON_CATALOG.filter((weapon) => weapon.slot === slot.id);
    if (activeInSlot.length !== 2) throw new Error(`Dev Campus: ${slot.id} must expose exactly two current weapons`);
  }
  assertUnique('weapon role', ACTIVE_WEAPON_CATALOG, ({ role }) => role);
  assertUnique('current enemy kind', CURRENT_ENEMY_CATALOG, ({ kind }) => kind);
  assertUnique('legacy enemy kind', LEGACY_ENEMY_CATALOG, ({ kind }) => kind);
  assertUnique('FX type', FX_CATALOG, ({ type }) => type);
  assertUnique('UI state', UI_STATE_CATALOG, ({ id }) => id);
  assertUnique('stage entry', STAGE_CATALOG, ({ id }) => id);
  assertUnique('experiment', EXPERIMENT_CATALOG, ({ id }) => id);
  assertUnique('system status', SYSTEM_STATUS_CATALOG, ({ id }) => id);
  assertUnique('source', SOURCE_CATALOG, ({ id }) => id);
}

/** Re-run the completeness/uniqueness contract from smoke tests or CI. */
export function validateCanonicalCatalogs(): void {
  assertCatalogIntegrity();
}

validateCanonicalCatalogs();

// Concise aliases for room code.
export const ACTIVE_WEAPONS = ACTIVE_WEAPON_CATALOG;
export const BAND_SLOTS = BAND_SLOT_CATALOG;
export const CURRENT_ENEMIES = CURRENT_ENEMY_CATALOG;
export const LEGACY_ENEMIES = LEGACY_ENEMY_CATALOG;
export const DORMANT_AUDIO = DORMANT_AUDIO_CATALOG;
export const FX = FX_CATALOG;
export const UI_STATES = UI_STATE_CATALOG;
export const STAGE_ENTRIES = STAGE_CATALOG;
export const EXPERIMENTS = EXPERIMENT_CATALOG;
export const SYSTEM_STATUSES = SYSTEM_STATUS_CATALOG;
export const SOURCES = SOURCE_CATALOG;
