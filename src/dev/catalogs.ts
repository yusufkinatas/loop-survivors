import { ROLE_META, ROLES, type Role } from '../audio/kits';
import { supportedRoles } from '../audio/soundset';
import { SLOTS, SLOT_LABEL, SLOT_ROSTER } from '../game/band';
import { ENEMIES, ENEMY_LABELS, type EnemyKind } from '../game/config';
import { STAGE_EVENTS, STAGE_WAVES } from '../game/madforest';
import type { ContentStatus } from './registry';

export interface CatalogEntry<T extends string = string> {
  readonly id: T;
  readonly name: string;
  readonly status: ContentStatus;
  readonly description: string;
}

export const ACTIVE_ENEMY_KINDS = [
  'bat', 'redBat', 'redBat2', 'zombie', 'skeleton', 'ghost',
  'greenMudman', 'grayMudman', 'flower', 'glowingBat', 'mantis', 'batSwarm',
] as const satisfies readonly EnemyKind[];

export const LEGACY_ENEMY_KINDS = [
  'swarmer', 'tank', 'darter', 'splitter', 'charger', 'circler', 'shielded', 'elite',
] as const satisfies readonly EnemyKind[];

const activeRoleSet = new Set<Role>(supportedRoles());
export const ACTIVE_WEAPONS: readonly CatalogEntry<Role>[] = ROLES
  .filter((role) => activeRoleSet.has(role))
  .map((role) => ({ id: role, name: ROLE_META[role].name, status: 'CURRENT', description: 'Offered production weapon' }));

export const DORMANT_AUDIO_ROLES: readonly CatalogEntry<Role>[] = ROLES
  .filter((role) => !activeRoleSet.has(role))
  .map((role) => ({ id: role, name: ROLE_META[role].name, status: 'DORMANT', description: 'Audio-only voice; never offered as a weapon' }));

export const ACTIVE_ENEMIES: readonly CatalogEntry<EnemyKind>[] = ACTIVE_ENEMY_KINDS.map((id) => ({
  id, name: ENEMY_LABELS[id] ?? id, status: 'CURRENT',
  description: `HP ${ENEMIES[id].hp}, damage ${ENEMIES[id].damage}, speed ${ENEMIES[id].speed.toFixed(1)}`,
}));

export const LEGACY_ENEMIES: readonly CatalogEntry<EnemyKind>[] = LEGACY_ENEMY_KINDS.map((id) => ({
  id, name: ENEMY_LABELS[id] ?? id, status: 'HISTORICAL', description: 'Pre-parity enemy retained for old replay compatibility',
}));

export const BAND_SLOTS = SLOTS.map((id) => ({
  id, name: SLOT_LABEL[id], status: 'CURRENT' as const,
  description: SLOT_ROSTER[id].map((role) => ROLE_META[role].name).join(' / '),
}));

export const UI_STATES = ['start', 'run', 'pause', 'reward', 'end', 'sandbox', 'replay'] as const;
export const FX_FAMILIES = ['hit', 'death', 'pickup', 'level-up', 'field', 'projectile', 'screen-shake'] as const;
export const STAGE_CATALOG = { waves: STAGE_WAVES, events: STAGE_EVENTS } as const;
export const EXPERIMENTS = [
  { id: 'boss-fights', name: 'Boss fights', status: 'EXPERIMENTAL', description: 'Standalone boss conductor prototypes' },
  { id: 'track-lab', name: 'Track Lab', status: 'HISTORICAL', description: 'Archived cover and destination-track experiments' },
] as const satisfies readonly CatalogEntry[];

export function assertCatalogs(): void {
  unique(ACTIVE_WEAPONS, 'active weapons');
  unique(DORMANT_AUDIO_ROLES, 'dormant audio roles');
  unique(ACTIVE_ENEMIES, 'active enemies');
  if (ACTIVE_WEAPONS.length !== 14) throw new Error(`expected 14 active weapons, got ${ACTIVE_WEAPONS.length}`);
  if (ACTIVE_ENEMIES.length !== 12) throw new Error(`expected 12 current enemies, got ${ACTIVE_ENEMIES.length}`);
  for (const dormant of DORMANT_AUDIO_ROLES) {
    if (activeRoleSet.has(dormant.id)) throw new Error(`${dormant.id} cannot be active and dormant`);
  }
  for (const role of ACTIVE_WEAPONS) {
    if (!SLOTS.some((slot) => SLOT_ROSTER[slot].includes(role.id))) throw new Error(`${role.id} has no band slot`);
  }
}

function unique(entries: readonly CatalogEntry[], label: string): void {
  const ids = entries.map(({ id }) => id);
  if (new Set(ids).size !== ids.length) throw new Error(`duplicate ${label} entry`);
}

assertCatalogs();
