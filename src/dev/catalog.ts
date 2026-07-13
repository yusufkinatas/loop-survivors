/** Canonical Dev Campus catalog. Generated rooms import these views instead of
 * maintaining their own weapon/enemy lists. Gameplay tables remain the source
 * of truth; this module only adds explicit status metadata. */
import { TIER_COUNT } from '../audio/charts';
import { ROLE_META, ROLES, type Role } from '../audio/kits';
import { SOUNDSET, supportedRoles } from '../audio/soundset';
import { SLOTS, SLOT_LABEL, SLOT_ROSTER, type Slot } from '../game/band';
import {
  ENEMIES,
  ENEMY_LABELS,
  LEVELUP,
  RUN,
  TIER_LINES,
  WEAPONS,
  madForestEnemyStats,
  type EnemyKind,
} from '../game/config';
import { STAGE_EVENTS, STAGE_STARTING_SPAWNS, STAGE_WAVES } from '../game/madforest';

export type ContentStatus =
  | 'CURRENT'
  | 'EXPERIMENTAL'
  | 'DORMANT'
  | 'PARKED'
  | 'REMOVED'
  | 'HISTORICAL';

export const ACTIVE_ENEMIES = [
  'bat', 'redBat', 'redBat2', 'zombie', 'skeleton', 'ghost',
  'greenMudman', 'grayMudman', 'flower', 'glowingBat', 'mantis', 'batSwarm',
] as const satisfies readonly EnemyKind[];

export const LEGACY_ENEMIES = [
  'swarmer', 'tank', 'darter', 'splitter', 'charger', 'circler', 'shielded', 'elite',
] as const satisfies readonly EnemyKind[];

export const DORMANT_AUDIO_ROLES = ['crash', 'riser'] as const satisfies readonly Role[];

export interface WeaponCatalogEntry {
  role: Role;
  name: string;
  color: string;
  slot: Slot;
  slotLabel: string;
  status: ContentStatus;
  tiers: NonNullable<(typeof WEAPONS)[Role]>;
  tierLines: string[];
  ladder: NonNullable<(typeof SOUNDSET.ladders)[Role]>;
}

export const ACTIVE_WEAPONS: readonly WeaponCatalogEntry[] = supportedRoles().map((role) => {
  const slot = SLOTS.find((candidate) => SLOT_ROSTER[candidate].includes(role));
  if (!slot || !WEAPONS[role] || !TIER_LINES[role] || !SOUNDSET.ladders[role]) {
    throw new Error(`canonical weapon registry incomplete for ${role}`);
  }
  return {
    role,
    name: ROLE_META[role].name,
    color: ROLE_META[role].color,
    slot,
    slotLabel: SLOT_LABEL[slot],
    status: 'CURRENT',
    tiers: WEAPONS[role]!,
    tierLines: TIER_LINES[role]!,
    ladder: SOUNDSET.ladders[role]!,
  };
});

export const AUDIO_CATALOG = ROLES.map((role) => ({
  role,
  ...ROLE_META[role],
  status: (supportedRoles().includes(role) ? 'CURRENT' : 'DORMANT') as ContentStatus,
}));

export const ENEMY_CATALOG = [
  ...ACTIVE_ENEMIES.map((kind) => ({
    kind,
    label: ENEMY_LABELS[kind] ?? kind,
    status: 'CURRENT' as const,
    category: ENEMIES[kind].boss ? 'boss' : ENEMIES[kind].fixedDirection ? 'event' : 'regular',
  })),
  ...LEGACY_ENEMIES.map((kind) => ({
    kind,
    label: kind,
    status: 'HISTORICAL' as const,
    category: 'legacy',
  })),
];

export const FX_CATALOG = [
  'ring', 'death', 'whip strip', 'melee arc', 'damage number', 'spark',
  'screen shake', 'screen flash', 'slam', 'level-up burst', 'hit flash',
  'ground-pick pulse',
] as const;

export const UI_STATE_CATALOG = [
  'start / developer disclosure', 'live HUD', 'empty / full / muted band rack',
  'pause', 'ground reward', 'death / victory', 'toast stack', 'now-playing overlay',
  'debug and performance overlays', 'Scratch Gym', 'replay controls',
  'experimental boss HUD',
] as const;

export const STAGE_CATALOG = {
  startingSpawns: STAGE_STARTING_SPAWNS,
  waves: STAGE_WAVES,
  events: STAGE_EVENTS,
  boundaryS: RUN.durationS,
};

export const INTERACTION_CATALOG = {
  player: {
    hp: RUN.playerHp,
    armor: RUN.playerArmor,
    speed: RUN.playerSpeed,
    radius: RUN.playerRadius,
    contactLockS: RUN.iframesS,
  },
  pickups: {
    gemPickupRadius: RUN.pickupRadius,
    magnetRadius: RUN.magnetRadius,
    groundChoicePickupRadius: LEVELUP.itemPickupRadius,
    groundChoicePlacementRadius: LEVELUP.itemRadius,
    enemyShoveRadius: LEVELUP.enemyPushRadius,
  },
};

export const EXPERIMENT_CATALOG = [
  { id: 'track-lab', name: 'Track Lab covers', status: 'HISTORICAL' as const },
  { id: 'boss-fights', name: 'Boss track fights', status: 'EXPERIMENTAL' as const },
];

export const SYSTEM_STATUS = [
  { name: 'Seven band slots / fourteen weapons / one soundset', status: 'CURRENT' as const },
  { name: 'Crash and riser catalog audio', status: 'DORMANT' as const },
  { name: 'Pre-parity enemy roster', status: 'HISTORICAL' as const },
  { name: 'Genres, full-track drop, passive items/effects, FX weapons', status: 'REMOVED' as const },
  { name: 'Boss integration, stage music hooks, tempo progression, swapping, visual style', status: 'PARKED' as const },
  { name: 'Track Lab and standalone boss areas', status: 'EXPERIMENTAL' as const },
];

export const SOURCE_STATIONS = [
  { system: 'roles and audio identity', file: 'src/audio/kits.ts', room: 'zoo/sounds' },
  { system: 'supported soundset and tempo', file: 'src/audio/soundset.ts', room: 'gym/music' },
  { system: 'band slots and rosters', file: 'src/game/band.ts', room: 'museum/band' },
  { system: 'weapon tiers and geometry', file: 'src/game/config.ts', room: 'zoo/weapons' },
  { system: 'enemy stats', file: 'src/game/config.ts', room: 'zoo/enemies' },
  { system: 'stage rows and events', file: 'src/game/madforest.ts', room: 'museum/stage' },
  { system: 'pick rules', file: 'src/game/picks.ts', room: 'gym/picks' },
  { system: 'timing patterns', file: 'src/audio/ladders/house.ts', room: 'zoo/patterns' },
  { system: 'simulation', file: 'src/game/run.ts', room: 'museum/world-view' },
  { system: 'rendering and cosmetic FX', file: 'src/game/view.ts', room: 'zoo/vfx' },
  { system: 'bot and replay seam', file: 'src/bot/conductor.ts', room: 'museum/determinism' },
] as const;

export function enemyCatalogStats(kind: EnemyKind, level: number) {
  return madForestEnemyStats(kind, level);
}

/** Build-time assertions double as catalog-completeness smoke tests. */
export function assertCanonicalCatalogs(): void {
  const active = new Set(ACTIVE_WEAPONS.map((entry) => entry.role));
  if (active.size !== 14) throw new Error(`active weapon count ${active.size} !== 14`);
  if (SLOTS.length !== 7) throw new Error(`slot count ${SLOTS.length} !== 7`);
  if (ACTIVE_ENEMIES.length !== 12) throw new Error(`active enemy count ${ACTIVE_ENEMIES.length} !== 12`);
  if (LEGACY_ENEMIES.some((kind) => ACTIVE_ENEMIES.includes(kind as never))) {
    throw new Error('current and historical enemy registries overlap');
  }
  for (const role of DORMANT_AUDIO_ROLES) {
    if (active.has(role)) throw new Error(`${role} is dormant but registered as active`);
  }
  for (const entry of ACTIVE_WEAPONS) {
    if (entry.tiers.length !== TIER_COUNT || entry.ladder.length !== TIER_COUNT) {
      throw new Error(`${entry.role} is missing one of ${TIER_COUNT} tiers`);
    }
  }
}

assertCanonicalCatalogs();
