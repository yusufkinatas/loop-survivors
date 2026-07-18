/**
 * Node-safe inventory of the visuals required by the live game.
 *
 * This module intentionally imports runtime value catalogs instead of parsing
 * TypeScript source.  The generated asset manifest can therefore fail when a
 * gameplay catalog changes without a matching visual decision.
 */

import { supportedRoles } from '../audio/soundset';
import {
  ALL_ENEMY_KINDS,
  BELL,
  ENEMIES,
  ENEMY_LABELS,
  LEVELUP,
  MAD_FOREST_FRAMES,
  RUN,
  SPLITTER,
  WEAPONS,
  legacyEnemyRadius,
  type EnemyKind,
  type WeaponConf,
} from './config';
import { ENDLESS_ENEMY_IDS, ENDLESS_WAVE_ROWS } from './endless';
import {
  EVOLUTION_BY_ROLE,
  EVOLUTION_IDS,
  EVOLUTIONS,
  ITEM_IDS,
  ITEMS,
} from './items';
import { ACTIVE_ENEMY_KINDS } from './madforest';
import { MILESTONE_IDS, SHOP_OFFER_IDS, SHOP_OFFERS } from './meta';
import {
  PIXEL_ACTION_ICON_IDS,
  PIXEL_ACTOR_ANCHOR,
  PIXEL_EFFECT_IDS,
  PIXEL_ENEMY_KINDS,
  PIXEL_ENVIRONMENT_IDS,
  PIXEL_FRAME_SIZE,
  PIXEL_PASSIVE_ICON_IDS,
  PIXEL_PICKUP_IDS,
  PIXEL_STATUS_ICON_IDS,
  PIXEL_WEAPON_ROLES,
  actionIconTextureKey,
  effectTextureKey,
  enemyTextureKey,
  environmentTextureKey,
  passiveIconTextureKey,
  pickupTextureKey,
  playerTextureKey,
  statusIconTextureKey,
  weaponTextureKey,
  type PixelWeaponRole,
} from './pixel-art';
import { ENCORE_IDS } from './picks';
import type { FxEvent, Gem, MusicNotePickup } from './run';

export const VISUAL_CATALOG_SCHEMA_VERSION = 1;

export type AtlasId = 'gameplay' | 'ui' | 'environment';
export type RuntimeUsage =
  | 'core-run'
  | 'core-and-sandbox'
  | 'sandbox-only'
  | 'development-experiment'
  | 'mapped-unrendered';

export type VisualScope =
  | 'core-run-opening'
  | 'core-run-endless'
  | 'core-run-ui'
  | 'sandbox'
  | 'boss-experiment'
  | 'tracklab-experiment'
  | 'rehearsal-experiment'
  | 'asset-catalog';

export interface VisualMapping {
  mode: 'direct' | 'shared' | 'runtime-treatment' | 'procedural' | 'image-file';
  atlas: AtlasId | null;
  frameKeys: readonly string[];
  assetPath: string | null;
  sharedWith: string | null;
  treatment: string | null;
  reason: string | null;
}

export interface SemanticVisualRequirement {
  id: string;
  category: string;
  subjectId: string;
  state: string;
  scopes: readonly VisualScope[];
  mapping: VisualMapping;
}

export interface PhysicalFrameMapping {
  atlas: AtlasId;
  frameKey: string;
  semanticIds: readonly string[];
  runtimeUsage: RuntimeUsage;
  usageNote: string;
}

export interface UiSurfaceDefinition {
  id: string;
  scope: VisualScope;
  implementation: 'dom' | 'pixi' | 'dom-and-pixi';
  coverage: 'release-gating' | 'development-validation' | 'development-reference';
  requiredVisuals: readonly string[];
}

export interface ExperimentScopeDecision {
  id: 'sandbox' | 'boss' | 'tracklab' | 'rehearsal';
  route: string;
  decision: 'in-scope-validation' | 'development-only';
  releaseCompletenessGate: boolean;
  note: string;
}

const codeUnitSort = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0;

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort(codeUnitSort);
}

function assertExactSet(label: string, left: readonly string[], right: readonly string[]): void {
  const leftSorted = sortedUnique(left);
  const rightSorted = sortedUnique(right);
  if (
    left.length === leftSorted.length &&
    right.length === rightSorted.length &&
    leftSorted.length === rightSorted.length &&
    leftSorted.every((value, index) => value === rightSorted[index])
  ) {
    return;
  }
  const leftSet = new Set(leftSorted);
  const rightSet = new Set(rightSorted);
  const onlyLeft = leftSorted.filter((value) => !rightSet.has(value));
  const onlyRight = rightSorted.filter((value) => !leftSet.has(value));
  throw new Error(
    `${label} catalog mismatch; runtime-only=[${onlyLeft.join(', ')}], art-only=[${onlyRight.join(', ')}], ` +
    `runtime-count=${left.length}/${leftSorted.length}-unique, art-count=${right.length}/${rightSorted.length}-unique`,
  );
}

const runtimeWeaponRoles = supportedRoles();
assertExactSet('enemy', ALL_ENEMY_KINDS, PIXEL_ENEMY_KINDS);
assertExactSet('weapon', runtimeWeaponRoles, PIXEL_WEAPON_ROLES);
assertExactSet('weapon config', runtimeWeaponRoles, Object.keys(WEAPONS));
assertExactSet('weapon evolution', runtimeWeaponRoles, EVOLUTION_IDS.map((id) => EVOLUTIONS[id].role));
assertExactSet('passive item', ITEM_IDS, PIXEL_PASSIVE_ICON_IDS);

export const LIVE_WEAPON_ROLES: readonly PixelWeaponRole[] = runtimeWeaponRoles.map(
  (role) => role as PixelWeaponRole,
);

export const ACTUAL_ENDLESS_ENEMY_KINDS: readonly EnemyKind[] = ALL_ENEMY_KINDS.filter((kind) =>
  ENDLESS_WAVE_ROWS.some((row) => (row.pattern as readonly EnemyKind[]).includes(kind)),
);

export const NORMAL_RUN_ENEMY_KINDS: readonly EnemyKind[] = ALL_ENEMY_KINDS.filter(
  (kind) =>
    ACTIVE_ENEMY_KINDS.includes(kind) ||
    ACTUAL_ENDLESS_ENEMY_KINDS.includes(kind) ||
    kind === SPLITTER.childKind,
);

export const ENDLESS_HEADLINER_KINDS: readonly EnemyKind[] = ALL_ENEMY_KINDS.filter((kind) =>
  ENDLESS_WAVE_ROWS.some((row) => row.pattern[0] === kind),
);

export const ENDLESS_DECLARED_BUT_UNUSED: readonly EnemyKind[] = ENDLESS_ENEMY_IDS.filter(
  (kind) => !(ACTUAL_ENDLESS_ENEMY_KINDS as readonly string[]).includes(kind),
);

function direct(atlas: AtlasId, frameKeys: readonly string[]): VisualMapping {
  return {
    mode: 'direct',
    atlas,
    frameKeys,
    assetPath: null,
    sharedWith: null,
    treatment: null,
    reason: null,
  };
}

function shared(
  atlas: AtlasId,
  frameKeys: readonly string[],
  sharedWith: string,
  treatment: string,
  reason: string,
): VisualMapping {
  return {
    mode: 'shared',
    atlas,
    frameKeys,
    assetPath: null,
    sharedWith,
    treatment,
    reason,
  };
}

function runtimeTreatment(
  atlas: AtlasId | null,
  frameKeys: readonly string[],
  sharedWith: string,
  treatment: string,
  reason: string,
): VisualMapping {
  return {
    mode: 'runtime-treatment',
    atlas,
    frameKeys,
    assetPath: null,
    sharedWith,
    treatment,
    reason,
  };
}

function procedural(treatment: string, reason: string): VisualMapping {
  return {
    mode: 'procedural',
    atlas: null,
    frameKeys: [],
    assetPath: null,
    sharedWith: null,
    treatment,
    reason,
  };
}

function imageFile(assetPath: string, treatment: string): VisualMapping {
  return {
    mode: 'image-file',
    atlas: null,
    frameKeys: [],
    assetPath,
    sharedWith: null,
    treatment,
    reason: null,
  };
}

function requirement(
  id: string,
  category: string,
  subjectId: string,
  state: string,
  scopes: readonly VisualScope[],
  mapping: VisualMapping,
): SemanticVisualRequirement {
  return { id, category, subjectId, state, scopes, mapping };
}

function enemyScopes(kind: EnemyKind): VisualScope[] {
  const scopes: VisualScope[] = [];
  if (ACTIVE_ENEMY_KINDS.includes(kind)) scopes.push('core-run-opening');
  if (ACTUAL_ENDLESS_ENEMY_KINDS.includes(kind) || kind === SPLITTER.childKind) scopes.push('core-run-endless');
  scopes.push('sandbox');
  return scopes;
}

interface EnemySpecialState {
  state: string;
  source: 'idle' | 'walk' | 'death' | 'aura';
  treatment: string;
  reason: string;
}

/** Every simulation enemy is listed, including entries with no extra state. */
const ENEMY_SPECIAL_STATES: Record<EnemyKind, readonly EnemySpecialState[]> = {
  bat: [],
  redBat: [],
  redBat2: [],
  zombie: [],
  skeleton: [],
  ghost: [],
  greenMudman: [],
  grayMudman: [],
  flower: [
    {
      state: 'event-formation',
      source: 'walk',
      treatment: 'No distinct frame; position and formation carry the event read.',
      reason: 'The live renderer has no flower event-state texture selection.',
    },
  ],
  glowingBat: [
    {
      state: 'boss',
      source: 'walk',
      treatment: 'Generic actor frames; boss classification affects simulation and rewards only.',
      reason: 'The live renderer does not select a separate boss frame for glowingBat.',
    },
  ],
  mantis: [
    {
      state: 'boss',
      source: 'walk',
      treatment: 'Generic actor frames at 0.6 scale.',
      reason: 'Mantis has a larger runtime scale but no separate boss-state frame.',
    },
  ],
  batSwarm: [
    {
      state: 'fixed-sweep',
      source: 'walk',
      treatment: 'One sprite follows a fixed movement vector.',
      reason: 'The multi-creature sweep has no direction- or formation-specific frame.',
    },
  ],
  swarmer: [
    {
      state: 'split-child',
      source: 'walk',
      treatment: 'Uses the ordinary swarmer walk loop after spawning.',
      reason: 'Splitter children have no distinct spawn-state art.',
    },
  ],
  tank: [],
  darter: [
    {
      state: 'pause',
      source: 'idle',
      treatment: 'No explicit texture switch; movement stopping is the only read.',
      reason: 'The view animates every enemy continuously regardless of dash phase.',
    },
    {
      state: 'dash',
      source: 'walk',
      treatment: 'Generic two-frame walk loop while moving quickly.',
      reason: 'The live renderer has no darter dash frame.',
    },
  ],
  splitter: [
    {
      state: 'split',
      source: 'death',
      treatment: 'Generic death burst followed by ordinary swarmer children.',
      reason: 'The live renderer has no splitter-specific rupture frame.',
    },
  ],
  charger: [
    {
      state: 'approach',
      source: 'walk',
      treatment: 'Generic walk loop.',
      reason: 'Approach has no separate texture.',
    },
    {
      state: 'windup',
      source: 'idle',
      treatment: 'Movement stops but the renderer continues its generic frame alternation.',
      reason: 'The live renderer has no charger windup frame.',
    },
    {
      state: 'dash',
      source: 'walk',
      treatment: 'Generic walk loop while moving at dash speed.',
      reason: 'The live renderer has no charger dash frame.',
    },
  ],
  circler: [
    {
      state: 'orbit-clockwise',
      source: 'walk',
      treatment: 'Horizontal flip follows last movement X only.',
      reason: 'Clockwise orbit has no directional frame set.',
    },
    {
      state: 'orbit-counterclockwise',
      source: 'walk',
      treatment: 'Horizontal flip follows last movement X only.',
      reason: 'Counterclockwise orbit has no directional frame set.',
    },
  ],
  shielded: [
    {
      state: 'shield-active',
      source: 'aura',
      treatment: 'impact-cyan aura at increased alpha behind generic actor frames.',
      reason: 'Shield state is a shared effect rather than a dedicated enemy frame.',
    },
    {
      state: 'shield-broken',
      source: 'walk',
      treatment: 'The shared aura disappears; actor frames do not change.',
      reason: 'There is no shield-break frame or dedicated break event.',
    },
  ],
  elite: [
    {
      state: 'objective',
      source: 'walk',
      treatment: 'Generic actor frames at 0.6 scale.',
      reason: 'Elite size is a runtime scale treatment, not a distinct state frame.',
    },
  ],
};

function enemySpecialMapping(kind: EnemyKind, spec: EnemySpecialState): VisualMapping {
  const idle = enemyTextureKey(kind, 'idle');
  const walk = enemyTextureKey(kind, 'walk');
  if (spec.source === 'death') {
    return shared('gameplay', [effectTextureKey('death')], `enemy/${kind}/state/death`, spec.treatment, spec.reason);
  }
  if (spec.source === 'aura') {
    return runtimeTreatment(
      'gameplay',
      [idle, walk, effectTextureKey('impact-cyan')],
      `enemy/${kind}/state/move`,
      spec.treatment,
      spec.reason,
    );
  }
  return shared(
    'gameplay',
    [spec.source === 'idle' ? idle : walk],
    `enemy/${kind}/state/${spec.source === 'idle' ? 'idle' : 'move'}`,
    spec.treatment,
    spec.reason,
  );
}

const enemyRequirements: SemanticVisualRequirement[] = ALL_ENEMY_KINDS.flatMap((kind) => {
  const idle = enemyTextureKey(kind, 'idle');
  const walk = enemyTextureKey(kind, 'walk');
  const scopes = enemyScopes(kind);
  const stateRequirements = [
    requirement(`enemy/${kind}/state/idle`, 'enemy', kind, 'idle', scopes, direct('gameplay', [idle])),
    requirement(`enemy/${kind}/state/move`, 'enemy', kind, 'move', scopes, direct('gameplay', [walk])),
    requirement(
      `enemy/${kind}/state/hit`,
      'enemy',
      kind,
      'hit',
      scopes,
      runtimeTreatment(
        'gameplay',
        [idle, walk],
        `enemy/${kind}/state/move`,
        'Brief #ffdfc2 tint over the current generic animation frame.',
        'The live renderer uses tint rather than a hit frame.',
      ),
    ),
    requirement(
      `enemy/${kind}/state/death`,
      'enemy',
      kind,
      'death',
      scopes,
      shared(
        'gameplay',
        [effectTextureKey('death')],
        'fx/event/death',
        'Generic death sprite scaled from the collision radius.',
        'All enemy kinds share one death effect.',
      ),
    ),
    requirement(
      `enemy/${kind}/state/headliner`,
      'enemy',
      kind,
      'headliner',
      ENDLESS_HEADLINER_KINDS.includes(kind) ? ['core-run-endless', 'sandbox'] : ['sandbox'],
      runtimeTreatment(
        'gameplay',
        [idle, walk, effectTextureKey('impact-gold')],
        `enemy/${kind}/state/move`,
        'Generic animation at 0.72 scale with #ffe8a3 tint and a gold aura.',
        'Headliner treatment is shared by every kind and ignores the purchased headlinerGold flag.',
      ),
    ),
  ];
  const canBeAmped = ENEMIES[kind].boss !== true && ENEMIES[kind].fixedDirection !== true && kind !== 'flower';
  if (canBeAmped) {
    stateRequirements.push(requirement(
      `enemy/${kind}/state/amped`,
      'enemy',
      kind,
      'amped',
      ACTUAL_ENDLESS_ENEMY_KINDS.includes(kind) || kind === SPLITTER.childKind
        ? ['core-run-endless', 'sandbox']
        : ['sandbox'],
      runtimeTreatment(
        'gameplay',
        [idle, walk, effectTextureKey('impact-cyan')],
        `enemy/${kind}/state/move`,
        'Generic animation with a rotating cyan aura.',
        'Amped enemies have no dedicated state frames.',
      ),
    ));
  }
  return [
    ...stateRequirements,
    ...ENEMY_SPECIAL_STATES[kind].map((spec) => requirement(
      `enemy/${kind}/state/${spec.state}`,
      'enemy',
      kind,
      spec.state,
      scopes,
      enemySpecialMapping(kind, spec),
    )),
  ];
});

interface WeaponBehaviorState {
  state: string;
  mapping: VisualMapping;
}

const normalWeaponKey = (role: PixelWeaponRole): string => weaponTextureKey(role, false);
const evolvedWeaponKey = (role: PixelWeaponRole): string => weaponTextureKey(role, true);

/** Renderer behavior decisions for every supported weapon. */
const WEAPON_BEHAVIOR_STATES: Record<PixelWeaponRole, readonly WeaponBehaviorState[]> = {
  kick: [
    {
      state: 'normal-facing-strip',
      mapping: shared('gameplay', [normalWeaponKey('kick')], 'weapon/kick/form/normal', 'Short expanding facing-side burst.', 'Normal kick uses its own frame.'),
    },
    {
      state: 'normal-opposite-follow-up',
      mapping: shared('gameplay', [normalWeaponKey('kick')], 'weapon/kick/behavior/normal-facing-strip', 'Horizontally mirrored repeat.', 'The follow-up intentionally reuses the normal kick frame.'),
    },
    {
      state: 'evolved-cross-beam',
      mapping: shared('gameplay', [evolvedWeaponKey('snare')], 'weapon/snare/behavior/evolved-railshot', 'Four dotted beam rails.', 'The core renderer currently substitutes evolved snare art; evolved kick art appears only in the boss experiment.'),
    },
  ],
  snare: [
    {
      state: 'normal-projectile',
      mapping: shared('gameplay', [normalWeaponKey('snare')], 'weapon/snare/form/normal', 'Fast piercing projectile.', 'Normal snare uses its own frame.'),
    },
    {
      state: 'evolved-railshot',
      mapping: shared('gameplay', [evolvedWeaponKey('snare')], 'weapon/snare/form/evolved', 'Dotted long-range beam and periodic side rails.', 'Railshot uses the evolved snare frame.'),
    },
  ],
  hat: [
    {
      state: 'normal-projectile',
      mapping: shared('gameplay', [normalWeaponKey('hat')], 'weapon/hat/form/normal', 'Fast scattered projectile.', 'Normal hat uses its own frame.'),
    },
    {
      state: 'evolved-prism-projectile',
      mapping: shared('gameplay', [evolvedWeaponKey('hat')], 'weapon/hat/form/evolved', 'Faster piercing projectile that retargets after a bounce.', 'Prism Rain uses the evolved hat frame.'),
    },
  ],
  clap: [
    {
      state: 'normal-cone',
      mapping: shared('gameplay', [normalWeaponKey('clap')], 'weapon/clap/form/normal', 'Rotated expanding close-range arc.', 'Normal clap uses its own frame.'),
    },
    {
      state: 'evolved-standing-ovation',
      mapping: shared('gameplay', [effectTextureKey('impact-cyan')], 'fx/event/ring', 'Viewport-sized shared ring plus a delayed pulse.', 'The core renderer never selects weapons/clap/evolved.'),
    },
  ],
  bass: [
    {
      state: 'normal-wave-projectile',
      mapping: shared('gameplay', [normalWeaponKey('bass')], 'weapon/bass/form/normal', 'Slow wide projectile.', 'Normal bass uses its own frame.'),
    },
    {
      state: 'evolved-subquake',
      mapping: shared('gameplay', [effectTextureKey('explosion')], 'fx/asset/explosion', 'Expanding generic explosion sprite.', 'The core renderer does not select evolved bass art; that frame appears only in the boss experiment.'),
    },
  ],
  chord: [
    {
      state: 'normal-zone',
      mapping: shared('gameplay', [normalWeaponKey('chord')], 'weapon/chord/form/normal', 'Rotating low-alpha circular zone.', 'Normal chord uses its own frame.'),
    },
    {
      state: 'evolved-drifting-zone',
      mapping: shared('gameplay', [evolvedWeaponKey('chord')], 'weapon/chord/form/evolved', 'Larger, longer-lived drifting zone.', 'Afterhours uses the evolved chord frame.'),
    },
  ],
  arp: [
    {
      state: 'normal-orbiter',
      mapping: shared('gameplay', [normalWeaponKey('arp')], 'weapon/arp/form/normal', 'Single projectile orbiting the player.', 'Normal arp uses its own frame.'),
    },
    {
      state: 'evolved-counter-orbiters',
      mapping: shared('gameplay', [evolvedWeaponKey('arp')], 'weapon/arp/form/evolved', 'Paired counter-rotating projectiles.', 'Event Horizon uses the evolved arp frame.'),
    },
  ],
  lead: [
    {
      state: 'normal-homing-projectile',
      mapping: shared('gameplay', [normalWeaponKey('lead')], 'weapon/lead/form/normal', 'Homing projectile.', 'Normal lead uses its own frame.'),
    },
    {
      state: 'evolved-serpent-projectile',
      mapping: shared('gameplay', [evolvedWeaponKey('lead')], 'weapon/lead/form/evolved', 'Faster, higher-pierce homing projectile with periodic enlarged shots.', 'Neon Serpent uses the evolved lead frame.'),
    },
  ],
  bell: [
    {
      state: 'normal-shatter-projectile',
      mapping: shared('gameplay', [normalWeaponKey('bell')], 'weapon/bell/form/normal', 'Projectile and smaller radial shard copies.', 'Bell and its shards share the normal frame.'),
    },
    {
      state: 'evolved-gravity-projectile',
      mapping: shared('gameplay', [evolvedWeaponKey('bell')], 'weapon/bell/form/evolved', 'Gravity projectile, shards, and rotating gravity well.', 'Gravity Bell uses one evolved frame for projectile and area states.'),
    },
  ],
};

const weaponRequirements: SemanticVisualRequirement[] = LIVE_WEAPON_ROLES.flatMap((role) => {
  const scopes: readonly VisualScope[] = ['core-run-opening', 'core-run-endless', 'sandbox'];
  return [
    requirement(`weapon/${role}/form/normal`, 'weapon', role, 'normal', scopes, direct('gameplay', [normalWeaponKey(role)])),
    requirement(`weapon/${role}/form/evolved`, 'weapon', role, 'evolved', scopes, direct('gameplay', [evolvedWeaponKey(role)])),
    ...WEAPON_BEHAVIOR_STATES[role].map(({ state, mapping }) => requirement(
      `weapon/${role}/behavior/${state}`,
      'weapon-behavior',
      role,
      state,
      scopes,
      mapping,
    )),
  ];
});

const pickupRequirements: SemanticVisualRequirement[] = [
  requirement('pickup/gem/blue', 'pickup', 'xp', 'blue', ['core-run-opening', 'core-run-endless', 'sandbox'], direct('gameplay', [pickupTextureKey('xp-blue')])),
  requirement('pickup/gem/green', 'pickup', 'xp', 'green', ['core-run-opening', 'core-run-endless', 'sandbox'], direct('gameplay', [pickupTextureKey('xp-green')])),
  requirement('pickup/gem/red', 'pickup', 'xp', 'red', ['core-run-opening', 'core-run-endless', 'sandbox'], direct('gameplay', [pickupTextureKey('xp-red')])),
  requirement('pickup/currency/note', 'pickup', 'music-note', 'note', ['core-run-opening', 'core-run-endless', 'sandbox'], direct('gameplay', [pickupTextureKey('music-note')])),
  requirement('pickup/currency/phrase', 'pickup', 'music-note', 'phrase', ['core-run-opening', 'core-run-endless', 'sandbox'], shared('gameplay', [pickupTextureKey('music-note')], 'pickup/currency/note', 'Same frame at 0.55 scale instead of 0.46.', 'Currency tiers are distinguished only by scale.')),
  requirement('pickup/currency/anthem', 'pickup', 'music-note', 'anthem', ['core-run-opening', 'core-run-endless', 'sandbox'], shared('gameplay', [pickupTextureKey('music-note')], 'pickup/currency/note', 'Same frame at 0.66 scale instead of 0.46.', 'Currency tiers are distinguished only by scale.')),
  requirement('pickup/reward/ground-pedestal', 'pickup', 'reward-pedestal', 'ground-choice', ['core-run-opening', 'core-run-endless', 'sandbox'], direct('gameplay', [pickupTextureKey('reward-pedestal')])),
  requirement('pickup/reward/encore-case', 'pickup', 'evolution-chest', 'encore-case', ['core-run-opening', 'core-run-endless', 'sandbox'], direct('gameplay', [pickupTextureKey('evolution-chest')])),
  requirement('pickup/reward/weapon-choice', 'pickup', 'reward-pedestal', 'weapon-choice', ['core-run-opening', 'core-run-endless', 'sandbox'], shared('gameplay', [pickupTextureKey('reward-pedestal')], 'pickup/reward/ground-pedestal', 'Pedestal plus a normal weapon frame.', 'Ground weapon choices reuse the common pedestal.')),
  requirement('pickup/reward/passive-choice', 'pickup', 'reward-pedestal', 'passive-choice', ['core-run-opening', 'core-run-endless', 'sandbox'], shared('gameplay', [pickupTextureKey('reward-pedestal')], 'pickup/reward/ground-pedestal', 'Pedestal plus a passive UI icon.', 'Ground passive choices reuse the common pedestal.')),
  requirement('pickup/reward/evolution-choice', 'pickup', 'reward-pedestal', 'evolution-choice', ['core-run-opening', 'core-run-endless', 'sandbox'], shared('gameplay', [pickupTextureKey('reward-pedestal')], 'pickup/reward/ground-pedestal', 'Pedestal plus the normal weapon frame, not the evolved preview.', 'The live ground-choice renderer always requests the normal weapon frame.')),
  requirement('pickup/reward/encore-choice', 'pickup', 'reward-pedestal', 'encore-choice', ['core-run-opening', 'core-run-endless', 'sandbox'], shared('gameplay', [pickupTextureKey('reward-pedestal')], 'pickup/reward/ground-pedestal', 'Pedestal plus an unrelated normal weapon frame selected per bonus.', 'Encore bonuses currently have no dedicated icons.')),
];

export const FX_EVENT_IDS = [
  'ring', 'death', 'whip', 'arc', 'dmg', 'spark', 'slam', 'beam', 'banner', 'evolution',
] as const satisfies readonly FxEvent['type'][];

type AssertNever<Value extends never> = Value;
export type UncatalogedFxEvent = AssertNever<Exclude<FxEvent['type'], (typeof FX_EVENT_IDS)[number]>>;

const XP_PICKUP_TIERS = ['blue', 'green', 'red'] as const satisfies readonly Gem['tier'][];
const MUSIC_NOTE_TIERS = ['note', 'phrase', 'anthem'] as const satisfies readonly MusicNotePickup['tier'][];
export type UncatalogedXpPickupTier = AssertNever<Exclude<Gem['tier'], (typeof XP_PICKUP_TIERS)[number]>>;
export type UncatalogedMusicNoteTier = AssertNever<Exclude<MusicNotePickup['tier'], (typeof MUSIC_NOTE_TIERS)[number]>>;

const fxAssetRequirements: SemanticVisualRequirement[] = PIXEL_EFFECT_IDS.map((id) => requirement(
  `fx/asset/${id}`,
  'fx-asset',
  id,
  'base',
  id === 'xp-collect' ? ['boss-experiment', 'asset-catalog'] : ['core-run-opening', 'core-run-endless', 'sandbox'],
  direct('gameplay', [effectTextureKey(id)]),
));

const fxEventRequirements: SemanticVisualRequirement[] = [
  requirement('fx/event/ring', 'fx-event', 'ring', 'emit', ['core-run-opening', 'core-run-endless', 'sandbox'], shared('gameplay', [effectTextureKey('impact-cyan'), effectTextureKey('impact-gold')], 'fx/asset/impact-cyan', 'Compact sprites distributed around the requested circle; bell-colored rings select gold.', 'One of two shared impact frames represents every ring radius.')),
  requirement('fx/event/death', 'fx-event', 'death', 'emit', ['core-run-opening', 'core-run-endless', 'sandbox'], shared('gameplay', [effectTextureKey('death')], 'fx/asset/death', 'Generic scaled burst.', 'All enemy deaths share one frame.')),
  requirement('fx/event/whip', 'fx-event', 'whip', 'emit', ['core-run-opening', 'core-run-endless', 'sandbox'], shared('gameplay', [normalWeaponKey('kick')], 'weapon/kick/form/normal', 'Expanding mirrored weapon sprite.', 'The attack frame doubles as the transient effect.')),
  requirement('fx/event/arc', 'fx-event', 'arc', 'emit', ['core-run-opening', 'core-run-endless', 'sandbox'], shared('gameplay', [normalWeaponKey('clap')], 'weapon/clap/form/normal', 'Rotated and expanded weapon sprite.', 'The attack frame doubles as the transient effect.')),
  requirement('fx/event/dmg', 'fx-event', 'dmg', 'emit', ['core-run-opening', 'core-run-endless', 'sandbox'], procedural('Pixi bitmap-style text with a bounded floater count.', 'Damage numbers are procedural text, not atlas art.')),
  requirement('fx/event/spark', 'fx-event', 'spark', 'emit', ['core-run-opening', 'core-run-endless', 'sandbox'], shared('gameplay', [effectTextureKey('impact-cyan'), effectTextureKey('impact-gold')], 'fx/asset/impact-cyan', 'Small moving copies; bell-colored sparks select gold.', 'Spark particles reuse impact sprites.')),
  requirement('fx/event/slam', 'fx-event', 'slam', 'emit', ['core-run-opening', 'core-run-endless', 'sandbox'], shared('gameplay', [effectTextureKey('explosion')], 'fx/asset/explosion', 'Scaled generic explosion.', 'Slam has no dedicated frame.')),
  requirement('fx/event/beam', 'fx-event', 'beam', 'emit', ['core-run-opening', 'core-run-endless', 'sandbox'], shared('gameplay', [evolvedWeaponKey('snare')], 'weapon/snare/form/evolved', 'Dotted rail of compact evolved-snare sprites.', 'All beam sources share evolved snare art.')),
  requirement('fx/event/banner', 'fx-event', 'banner', 'emit', ['core-run-opening', 'core-run-endless', 'sandbox'], shared('gameplay', [effectTextureKey('celebration')], 'fx/asset/celebration', 'Celebration sprite plus procedural text.', 'Banner text is procedural and shares the celebration frame.')),
  requirement('fx/event/evolution', 'fx-event', 'evolution', 'emit', ['core-run-opening', 'core-run-endless', 'sandbox'], shared('gameplay', [effectTextureKey('celebration')], 'fx/asset/celebration', 'Larger celebration sprite plus procedural text.', 'Evolution has no separate frame.')),
];

const playerRequirements: SemanticVisualRequirement[] = [
  requirement('player/state/idle', 'player', 'player', 'idle', ['core-run-opening', 'core-run-endless', 'sandbox'], direct('gameplay', [playerTextureKey('idle')])),
  requirement('player/state/move', 'player', 'player', 'move', ['core-run-opening', 'core-run-endless', 'sandbox'], direct('gameplay', [playerTextureKey('walk')])),
  requirement('player/state/invulnerable', 'player', 'player', 'invulnerable', ['core-run-opening', 'core-run-endless', 'sandbox'], runtimeTreatment('gameplay', [playerTextureKey('idle'), playerTextureKey('walk')], 'player/state/move', 'Alternating alpha blink over the current frame.', 'There is no dedicated hurt or invulnerability frame.')),
  requirement('player/state/foot-marker', 'player', 'player', 'foot-marker', ['core-run-opening', 'core-run-endless', 'sandbox'], shared('gameplay', [effectTextureKey('impact-cyan')], 'fx/asset/impact-cyan', 'Small pulsing cyan sprite beneath the actor.', 'The locator marker reuses an impact effect.')),
];

const passiveRequirements: SemanticVisualRequirement[] = PIXEL_PASSIVE_ICON_IDS.map((id) => requirement(
  `ui/passive/${id}`,
  'ui-passive',
  id,
  'icon',
  ['core-run-ui', 'sandbox'],
  direct('ui', [passiveIconTextureKey(id)]),
));

const statusRequirements: SemanticVisualRequirement[] = PIXEL_STATUS_ICON_IDS.map((id) => requirement(
  `ui/status/${id}`,
  'ui-status',
  id,
  'icon',
  id === 'pause' ? ['asset-catalog'] : ['core-run-ui', 'sandbox'],
  direct('ui', [statusIconTextureKey(id)]),
));

const actionRequirements: SemanticVisualRequirement[] = PIXEL_ACTION_ICON_IDS.map((id) => requirement(
  `ui/action/${id}`,
  'ui-action',
  id,
  'icon',
  ['asset-catalog'],
  direct('ui', [actionIconTextureKey(id)]),
));

const environmentRequirements: SemanticVisualRequirement[] = PIXEL_ENVIRONMENT_IDS.map((id) => requirement(
  `environment/prop/${id}`,
  'environment-prop',
  id,
  'decorative-noncolliding',
  ['core-run-opening', 'core-run-endless', 'sandbox'],
  direct('environment', [environmentTextureKey(id)]),
));

const standaloneImageRequirements: SemanticVisualRequirement[] = [
  requirement('environment/floor/arena', 'environment-floor', 'arena-floor', 'seamless', ['core-run-opening', 'core-run-endless', 'sandbox'], imageFile('public/art/pixel/arena-floor.png', 'Opaque seamless native 16x16 repeated floor tile.')),
  requirement('ui/title/banner', 'ui-title', 'title-banner', 'hero', ['core-run-ui'], imageFile('public/art/pixel/title-banner.png', 'Text-free native 320x180 title art displayed with integer nearest-neighbor scaling.')),
];

export const SEMANTIC_VISUAL_REQUIREMENTS: readonly SemanticVisualRequirement[] = [
  ...playerRequirements,
  ...enemyRequirements,
  ...weaponRequirements,
  ...pickupRequirements,
  ...fxAssetRequirements,
  ...fxEventRequirements,
  ...passiveRequirements,
  ...statusRequirements,
  ...actionRequirements,
  ...environmentRequirements,
  ...standaloneImageRequirements,
];

function weaponFrameUsage(role: PixelWeaponRole, evolved: boolean): { usage: RuntimeUsage; note: string } {
  if (!evolved) return { usage: 'core-and-sandbox', note: 'Rendered by core combat and reward-choice surfaces.' };
  if (role === 'clap') return { usage: 'mapped-unrendered', note: 'Standing Ovation renders a shared ring; no runtime call selects this frame.' };
  if (role === 'kick' || role === 'bass') {
    return { usage: 'development-experiment', note: 'Used by the standalone boss experiment but not by core RunView.' };
  }
  return { usage: 'core-and-sandbox', note: 'Rendered by the evolved core weapon behavior.' };
}

function enemyFrameUsage(kind: EnemyKind): { usage: RuntimeUsage; note: string } {
  if (NORMAL_RUN_ENEMY_KINDS.includes(kind)) {
    return { usage: 'core-and-sandbox', note: 'Reachable in the normal run and the Sandbox.' };
  }
  return { usage: 'sandbox-only', note: 'Available through the complete Sandbox catalog but absent from normal-run wave catalogs.' };
}

export const PHYSICAL_FRAME_MAPPINGS: readonly PhysicalFrameMapping[] = [
  {
    atlas: 'gameplay',
    frameKey: playerTextureKey('idle'),
    semanticIds: ['player/state/idle'],
    runtimeUsage: 'core-and-sandbox',
    usageNote: 'Player idle frame.',
  },
  {
    atlas: 'gameplay',
    frameKey: playerTextureKey('walk'),
    semanticIds: ['player/state/move'],
    runtimeUsage: 'core-and-sandbox',
    usageNote: 'Player movement frame.',
  },
  ...PIXEL_ENEMY_KINDS.flatMap((kind) => {
    const usage = enemyFrameUsage(kind);
    return (['idle', 'walk'] as const).map((frame) => ({
      atlas: 'gameplay' as const,
      frameKey: enemyTextureKey(kind, frame),
      semanticIds: [`enemy/${kind}/state/${frame === 'walk' ? 'move' : 'idle'}`],
      runtimeUsage: usage.usage,
      usageNote: usage.note,
    }));
  }),
  ...PIXEL_WEAPON_ROLES.flatMap((role) => (['normal', 'evolved'] as const).map((form) => {
    const usage = weaponFrameUsage(role, form === 'evolved');
    return {
      atlas: 'gameplay' as const,
      frameKey: weaponTextureKey(role, form === 'evolved'),
      semanticIds: [`weapon/${role}/form/${form}`],
      runtimeUsage: usage.usage,
      usageNote: usage.note,
    };
  })),
  ...PIXEL_PICKUP_IDS.map((id) => {
    const semanticById: Record<(typeof PIXEL_PICKUP_IDS)[number], string> = {
      'xp-blue': 'pickup/gem/blue',
      'xp-green': 'pickup/gem/green',
      'xp-red': 'pickup/gem/red',
      'music-note': 'pickup/currency/note',
      'reward-pedestal': 'pickup/reward/ground-pedestal',
      'evolution-chest': 'pickup/reward/encore-case',
    };
    return {
      atlas: 'gameplay' as const,
      frameKey: pickupTextureKey(id),
      semanticIds: [semanticById[id]],
      runtimeUsage: 'core-and-sandbox' as const,
      usageNote: 'Rendered by the core pickup or physical reward system.',
    };
  }),
  ...PIXEL_EFFECT_IDS.map((id) => ({
    atlas: 'gameplay' as const,
    frameKey: effectTextureKey(id),
    semanticIds: [`fx/asset/${id}`],
    runtimeUsage: id === 'xp-collect' ? 'development-experiment' as const : 'core-and-sandbox' as const,
    usageNote: id === 'xp-collect'
      ? 'Used as a dash effect in the boss experiment; core RunView never selects it.'
      : 'Rendered by core combat, enemy-state, or reward effects.',
  })),
  ...PIXEL_PASSIVE_ICON_IDS.map((id) => ({
    atlas: 'ui' as const,
    frameKey: passiveIconTextureKey(id),
    semanticIds: [`ui/passive/${id}`],
    runtimeUsage: 'core-and-sandbox' as const,
    usageNote: 'Rendered in build, pause, and reward UI.',
  })),
  ...PIXEL_STATUS_ICON_IDS.map((id) => ({
    atlas: 'ui' as const,
    frameKey: statusIconTextureKey(id),
    semanticIds: [`ui/status/${id}`],
    runtimeUsage: id === 'pause' ? 'mapped-unrendered' as const : 'core-run' as const,
    usageNote: id === 'pause'
      ? 'Present in the atlas and HUD index but no live surface renders it.'
      : 'Rendered by the live HUD or career UI.',
  })),
  ...PIXEL_ACTION_ICON_IDS.map((id) => ({
    atlas: 'ui' as const,
    frameKey: actionIconTextureKey(id),
    semanticIds: [`ui/action/${id}`],
    runtimeUsage: 'mapped-unrendered' as const,
    usageNote: 'Present in the atlas and HUD index but no live surface renders action icons.',
  })),
  ...PIXEL_ENVIRONMENT_IDS.map((id) => ({
    atlas: 'environment' as const,
    frameKey: environmentTextureKey(id),
    semanticIds: [`environment/prop/${id}`],
    runtimeUsage: 'core-and-sandbox' as const,
    usageNote: 'Reachable through deterministic non-colliding environment decoration.',
  })),
];

export const UI_SURFACES: readonly UiSurfaceDefinition[] = [
  { id: 'title-and-starting-weapon', scope: 'core-run-ui', implementation: 'dom', coverage: 'release-gating', requiredVisuals: ['ui/title/banner', 'ui/status/note'] },
  { id: 'career-and-collection', scope: 'core-run-ui', implementation: 'dom', coverage: 'release-gating', requiredVisuals: ['ui/status/note', ...ITEM_IDS.map((id) => `ui/passive/${id}`)] },
  { id: 'starting-passive-selector', scope: 'core-run-ui', implementation: 'dom', coverage: 'release-gating', requiredVisuals: ITEM_IDS.map((id) => `ui/passive/${id}`) },
  { id: 'mastery-and-evolution-hints', scope: 'core-run-ui', implementation: 'dom', coverage: 'release-gating', requiredVisuals: LIVE_WEAPON_ROLES.map((role) => `weapon/${role}/form/normal`) },
  { id: 'afterhours-shop', scope: 'core-run-ui', implementation: 'dom', coverage: 'release-gating', requiredVisuals: ['ui/status/note'] },
  { id: 'live-hud', scope: 'core-run-ui', implementation: 'dom', coverage: 'release-gating', requiredVisuals: ['ui/status/heart', 'ui/status/xp', 'ui/status/note', 'ui/status/level'] },
  { id: 'band-and-passive-racks', scope: 'core-run-ui', implementation: 'dom', coverage: 'release-gating', requiredVisuals: ITEM_IDS.map((id) => `ui/passive/${id}`) },
  { id: 'pause-overlay', scope: 'core-run-ui', implementation: 'dom', coverage: 'release-gating', requiredVisuals: ITEM_IDS.map((id) => `ui/passive/${id}`) },
  { id: 'ground-reward-choices', scope: 'core-run-ui', implementation: 'dom-and-pixi', coverage: 'release-gating', requiredVisuals: ['pickup/reward/ground-pedestal', 'pickup/reward/weapon-choice', 'pickup/reward/passive-choice', 'pickup/reward/evolution-choice', 'pickup/reward/encore-choice'] },
  { id: 'toasts-hit-level-and-vignette', scope: 'core-run-ui', implementation: 'dom-and-pixi', coverage: 'release-gating', requiredVisuals: ['fx/event/banner', 'fx/event/evolution'] },
  { id: 'death-and-settlement', scope: 'core-run-ui', implementation: 'dom', coverage: 'release-gating', requiredVisuals: ['ui/status/note'] },
  { id: 'track-overlay', scope: 'core-run-ui', implementation: 'dom', coverage: 'development-validation', requiredVisuals: [] },
  { id: 'debug-performance-and-time-controls', scope: 'core-run-ui', implementation: 'dom', coverage: 'development-validation', requiredVisuals: [] },
  { id: 'mobile-joystick', scope: 'core-run-ui', implementation: 'dom', coverage: 'release-gating', requiredVisuals: [] },
  { id: 'sandbox-combat', scope: 'sandbox', implementation: 'dom-and-pixi', coverage: 'development-validation', requiredVisuals: ALL_ENEMY_KINDS.map((kind) => `enemy/${kind}/state/idle`) },
  { id: 'sandbox-build', scope: 'sandbox', implementation: 'dom-and-pixi', coverage: 'development-validation', requiredVisuals: [...LIVE_WEAPON_ROLES.map((role) => `weapon/${role}/form/normal`), ...ITEM_IDS.map((id) => `ui/passive/${id}`)] },
  { id: 'sandbox-career-and-pickups', scope: 'sandbox', implementation: 'dom-and-pixi', coverage: 'development-validation', requiredVisuals: ['pickup/gem/blue', 'pickup/gem/green', 'pickup/currency/note', 'pickup/currency/phrase', 'pickup/currency/anthem', 'pickup/reward/encore-case'] },
  { id: 'boss-fight-experiment', scope: 'boss-experiment', implementation: 'dom-and-pixi', coverage: 'development-reference', requiredVisuals: ['weapon/kick/form/evolved', 'weapon/bass/form/evolved', 'fx/asset/xp-collect'] },
  { id: 'tracklab-experiment', scope: 'tracklab-experiment', implementation: 'dom', coverage: 'development-reference', requiredVisuals: [] },
  { id: 'rehearsal-experiment', scope: 'rehearsal-experiment', implementation: 'dom', coverage: 'development-reference', requiredVisuals: [] },
];

export const EXPERIMENT_SCOPE_DECISIONS: readonly ExperimentScopeDecision[] = [
  {
    id: 'sandbox',
    route: 'start-menu:sandbox',
    decision: 'in-scope-validation',
    releaseCompletenessGate: true,
    note: 'The Sandbox is the comprehensive visual inspection surface and must expose every live catalog entry.',
  },
  {
    id: 'boss',
    route: '#boss',
    decision: 'development-only',
    releaseCompletenessGate: false,
    note: 'Standalone playtest surface; its asset references are tracked but do not define core-run completeness.',
  },
  {
    id: 'tracklab',
    route: '#tracklab',
    decision: 'development-only',
    releaseCompletenessGate: false,
    note: 'Standalone full-track audition surface with no core pixel-atlas completeness requirements.',
  },
  {
    id: 'rehearsal',
    route: '#rehearsal',
    decision: 'development-only',
    releaseCompletenessGate: false,
    note: 'Standalone sound-editing surface with no core pixel-atlas completeness requirements.',
  },
];

export const LIVE_CATALOG_SNAPSHOT = {
  enemies: {
    all: [...ALL_ENEMY_KINDS],
    opening: [...ACTIVE_ENEMY_KINDS],
    endlessDeclared: [...ENDLESS_ENEMY_IDS],
    endlessWaveRows: ENDLESS_WAVE_ROWS.map((row) => ({ id: row.id, pattern: [...row.pattern] })),
    endlessActual: [...ACTUAL_ENDLESS_ENEMY_KINDS],
    endlessHeadliners: [...ENDLESS_HEADLINER_KINDS],
    declaredButUnused: [...ENDLESS_DECLARED_BUT_UNUSED],
    derivedSpawnKinds: [SPLITTER.childKind],
    normalRun: [...NORMAL_RUN_ENEMY_KINDS],
    sandbox: [...ALL_ENEMY_KINDS],
    entries: ALL_ENEMY_KINDS.map((id) => ({
      id,
      label: ENEMY_LABELS[id],
      boss: ENEMIES[id].boss === true,
      fixedDirection: ENEMIES[id].fixedDirection === true,
      behaviorStates: ENEMY_SPECIAL_STATES[id].map((state) => state.state),
    })),
  },
  weapons: {
    supported: [...LIVE_WEAPON_ROLES],
    entries: LIVE_WEAPON_ROLES.map((id) => ({
      id,
      tiers: WEAPONS[id]?.length ?? 0,
      behaviorStates: WEAPON_BEHAVIOR_STATES[id].map((state) => state.state),
      evolution: EVOLUTION_BY_ROLE[id]
        ? {
            id: EVOLUTION_BY_ROLE[id].id,
            item: EVOLUTION_BY_ROLE[id].item,
            name: EVOLUTION_BY_ROLE[id].name,
          }
        : null,
    })),
  },
  passives: ITEM_IDS.map((id) => ({ id, name: ITEMS[id].name })),
  pickupTiers: {
    xp: [...XP_PICKUP_TIERS],
    currency: [...MUSIC_NOTE_TIERS],
    physicalRewards: ['ground-pedestal', 'encore-case'],
    encoreChoices: [...ENCORE_IDS],
  },
  fxEvents: [...FX_EVENT_IDS],
  statusIcons: [...PIXEL_STATUS_ICON_IDS],
  actionIcons: [...PIXEL_ACTION_ICON_IDS],
  environment: [...PIXEL_ENVIRONMENT_IDS],
  ui: {
    surfaces: UI_SURFACES.map((surface) => surface.id),
    milestones: [...MILESTONE_IDS],
    shopOffers: SHOP_OFFER_IDS.map((id) => {
      const offer = SHOP_OFFERS.find((candidate) => candidate.id === id);
      if (!offer) throw new Error(`Missing SHOP_OFFERS entry for ${id}`);
      return { id, kind: offer.kind, contentId: offer.contentId };
    }),
  },
} as const;

const LEGACY_WORLD_SCALE = 800 / 456;
const KICK_BASE_WIDTH = 85 * LEGACY_WORLD_SCALE;
const KICK_BASE_HEIGHT = 22 * LEGACY_WORLD_SCALE;

function legacyBodyVariants(kind: EnemyKind): Array<{
  variant: number;
  source: 'configured-radius' | 'legacy-frame';
  sourceFrame: { width: number; height: number } | null;
  radius: number;
  footOffset: { x: number; y: number };
}> {
  const frames = MAD_FOREST_FRAMES[kind];
  if (!frames || frames.length === 0) {
    return [{
      variant: 0,
      source: 'configured-radius',
      sourceFrame: null,
      radius: ENEMIES[kind].radius,
      footOffset: { x: 0, y: 0 },
    }];
  }
  return frames.map((frame, variant) => {
    const requestedRadius = frame.width * 0.4;
    const effectiveRadius = Math.floor(requestedRadius);
    return {
      variant,
      source: 'legacy-frame',
      sourceFrame: { width: frame.width, height: frame.height },
      radius: legacyEnemyRadius(frame.width),
      footOffset: {
        x: (frame.width / 2 - requestedRadius / 2 - effectiveRadius) * LEGACY_WORLD_SCALE,
        y: (frame.height - requestedRadius / 2 - effectiveRadius) * LEGACY_WORLD_SCALE,
      },
    };
  });
}

function attackTier(role: PixelWeaponRole, tier: number, conf: WeaponConf): object {
  return {
    tier,
    coordinateSpace: 'simulation-world-h800-reference',
    collisionShape: role === 'kick'
      ? 'growing-axis-aligned-strip'
      : role === 'clap'
        ? 'forward-cone'
        : role === 'chord'
          ? 'circle-zone'
          : 'circle-projectile',
    configuredRadius: conf.radius ?? null,
    configuredArea: conf.area ?? null,
    configuredArcRadians: conf.arc ?? null,
    configuredOrbitRadius: conf.orbitRadius ?? null,
    kickFullWidth: role === 'kick' ? KICK_BASE_WIDTH * (conf.area ?? 1) : null,
    kickFullHeight: role === 'kick' ? KICK_BASE_HEIGHT * (conf.area ?? 1) : null,
  };
}

/** Values copied from the current renderer where no public runtime registry exists. */
export const COLLISION_BASELINE_SOURCE = {
  coordinateSpaces: [
    {
      id: 'simulation-world-h800-reference',
      definition: 'Simulation units normalized against the legacy 800-high reference world.',
    },
    {
      id: 'atlas-pixels',
      definition: `Untrimmed ${PIXEL_FRAME_SIZE}x${PIXEL_FRAME_SIZE} atlas cell coordinates.`,
    },
    {
      id: 'logical-render-pixels',
      definition: 'Pixi logical pixels before device-pixel-ratio density.',
    },
  ],
  anchors: {
    playerAndEnemy: { coordinateSpace: 'atlas-pixels', ...PIXEL_ACTOR_ANCHOR },
    environment: { coordinateSpace: 'atlas-pixels', ...PIXEL_ACTOR_ANCHOR },
    weaponsPickupsFxAndUi: { coordinateSpace: 'atlas-pixels', x: 0.5, y: 0.5 },
  },
  runtimeScales: {
    coordinateSpace: 'logical-render-pixels',
    player: 0.5,
    playerFootMarker: { low: 0.32, high: 0.36 },
    enemyDefault: 0.5,
    enemyElite: 0.6,
    enemyMantis: 0.6,
    enemyHeadliner: 0.72,
    environment: 0.5,
    xpGem: 0.5,
    musicNote: { note: 0.46, phrase: 0.55, anthem: 0.66 },
    encoreCase: 0.62,
    rewardPedestal: 0.62,
    rewardWeaponIcon: 0.31,
    rewardPassiveIcon: 0.27,
    projectileBase: { snare: 0.28, hat: 0.25, bass: 0.34, lead: 0.27, arp: 0.27, bell: 0.32 },
    projectileScaleQuantization: 'nearest 1/8 step',
    domUiAtlas: 0.25,
    domMeterIconAdditionalTransform: 0.5,
    titleBannerSourceUpscale: 4,
  },
  player: {
    coordinateSpace: 'simulation-world-h800-reference',
    collisionRadius: RUN.playerRadius,
    footOffset: { x: 1 * LEGACY_WORLD_SCALE, y: 7 * LEGACY_WORLD_SCALE },
    collisionCenter: 'player.x/player.y',
    spritePosition: 'player.x/player.y',
    rendererAppliesFootOffset: false,
  },
  enemies: ALL_ENEMY_KINDS.map((kind) => ({
    id: kind,
    coordinateSpace: 'simulation-world-h800-reference',
    bodyVariants: legacyBodyVariants(kind),
    collisionCenter: 'enemy.x/enemy.y',
    spritePosition: 'enemy.x/enemy.y',
    rendererAppliesFootOffset: false,
  })),
  attacks: {
    coordinateSpace: 'simulation-world-h800-reference',
    weaponTiers: LIVE_WEAPON_ROLES.map((role) => ({
      role,
      tiers: (WEAPONS[role] ?? []).map((conf, index) => attackTier(role, index + 1, conf)),
    })),
    kickBase: { width: KICK_BASE_WIDTH, height: KICK_BASE_HEIGHT },
    bellShards: { radius: BELL.shardRadius },
    evolvedSpecials: {
      redlineStomp: { shape: 'viewport-relative-cross', halfThicknessFormula: 'kickBaseHeight * area * 0.75' },
      railshot: { shape: 'line', length: 900, halfWidthFormula: 'max(7, configuredRadius * 1.25)' },
      standingOvation: { shape: 'viewport-relative-circle', radiusFormula: 'hypot(worldW, worldH) * 0.58 * areaMul' },
      subquake: { shape: 'expanding-circle', startRadius: 40, maxRadius: { ordinary: 360, fatVariant: 480 } },
      afterhours: { shape: 'circle-zone', configuredRadiusMultiplier: 1.55 },
      eventHorizon: { shape: 'circle-projectile', configuredRadiusMultiplier: 1.25 },
      gravityBell: { shape: 'circle-projectile-and-well', projectileRadiusMultiplier: 1.0, wellRadius: 130 },
    },
  },
  pickups: {
    coordinateSpace: 'simulation-world-h800-reference',
    magnetAttractionRadius: RUN.magnetRadius,
    xpCollectionRadius: RUN.pickupRadius,
    musicNoteCollectionRadius: RUN.pickupRadius + 4,
    groundRewardCollectionRadius: LEVELUP.itemPickupRadius,
    groundRewardSpawnRadius: LEVELUP.itemRadius,
  },
} as const;
