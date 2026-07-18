/**
 * Pure review-page catalog shared by the browser surface and its Node check.
 * Keep this module free of DOM/Pixi imports so coverage can be checked without
 * booting the game or creating a canvas.
 */

export const PRODUCTION_ART_DIRECTION = 'arcade-reliquary';
export const PRODUCTION_ART_LOGICAL_WIDTH = 640;
export const PRODUCTION_ART_LOGICAL_HEIGHT = 360;
export const PRODUCTION_ART_HEADER_HEIGHT = 18;
export const PRODUCTION_ART_LABEL_HEIGHT = 12;
export const PRODUCTION_ART_PAIR_GAP = 4;

export const PRODUCTION_ART_ATLAS_URLS = Object.freeze({
  gameplay: '/art/pixel/gameplay.json',
  ui: '/art/pixel/ui.json',
  environment: '/art/pixel/environment.json',
});

export type ProductionArtAtlasId = keyof typeof PRODUCTION_ART_ATLAS_URLS;
export type ProductionArtFamily =
  | 'enemy-idles'
  | 'actor-motion'
  | 'weapons'
  | 'pickups-effects'
  | 'ui-icons'
  | 'environment-props';
export type ProductionArtPresentation =
  | 'silhouette-normal'
  | 'idle-walk'
  | 'normal-evolved'
  | 'single';
export type ProductionArtVisionMode =
  | 'normal'
  | 'grayscale'
  | 'protanopia'
  | 'deuteranopia'
  | 'tritanopia';

export const PRODUCTION_ART_VISION_MODES = [
  'normal',
  'grayscale',
  'protanopia',
  'deuteranopia',
  'tritanopia',
] as const satisfies readonly ProductionArtVisionMode[];

export interface ProductionArtEntry {
  readonly id: string;
  readonly label: string;
  readonly keys: readonly string[];
}
export interface ProductionArtPage {
  readonly id: string;
  readonly family: ProductionArtFamily;
  readonly title: string;
  readonly legend: string;
  readonly atlas: ProductionArtAtlasId;
  readonly presentation: ProductionArtPresentation;
  readonly columns: number;
  readonly rows: number;
  readonly entries: readonly ProductionArtEntry[];
}

export const PRODUCTION_ENEMIES = [
  ['swarmer', 'Crypt Wisp'],
  ['tank', 'Void Golem'],
  ['darter', 'Iron Scarab'],
  ['splitter', 'Thorn Maw'],
  ['charger', 'Ember Boar'],
  ['circler', 'Rune Eye'],
  ['shielded', 'Aegis Knight'],
  ['elite', 'Eclipse Guardian'],
  ['bat', 'Dusk Moth'],
  ['redBat', 'Ember Moth'],
  ['redBat2', 'Frost Moth'],
  ['zombie', 'Plague Husk'],
  ['skeleton', 'Bone Warden'],
  ['ghost', 'Phase Shade'],
  ['greenMudman', 'Moss Golem'],
  ['grayMudman', 'Slate Golem'],
  ['flower', 'Spore Maw'],
  ['glowingBat', 'Crown Wraith'],
  ['mantis', 'Crypt Spider'],
  ['batSwarm', 'Dusk Swarm'],
] as const;

export const PRODUCTION_WEAPONS = [
  ['kick', 'Kick'],
  ['clap', 'Clap'],
  ['snare', 'Snare'],
  ['hat', 'Hi-hat'],
  ['bass', 'Bass'],
  ['lead', 'Lead'],
  ['arp', 'Arp'],
  ['chord', 'Chord'],
  ['bell', 'Bell'],
] as const;

export const PRODUCTION_PICKUPS = [
  ['xp-blue', 'XP · blue'],
  ['xp-green', 'XP · green'],
  ['xp-red', 'XP · red'],
  ['music-note', 'Music note'],
  ['reward-pedestal', 'Reward pedestal'],
  ['evolution-chest', 'Encore Case'],
] as const;

export const PRODUCTION_EFFECTS = [
  ['impact-cyan', 'Cyan impact'],
  ['impact-gold', 'Gold impact'],
  ['explosion', 'Explosion'],
  ['death', 'Death effect'],
  ['xp-collect', 'XP collection'],
  ['celebration', 'Celebration'],
] as const;

export const PRODUCTION_UI_ICONS = [
  ['items/highTops', 'High-Tops'],
  ['items/fastForward', 'Fast Forward'],
  ['items/needleTips', 'Needle Tips'],
  ['items/mirrorball', 'Mirrorball'],
  ['items/wideLens', 'Wide Lens'],
  ['items/heavyAmp', 'Heavy Amp'],
  ['items/extensionCable', 'Extension Cable'],
  ['items/magnetLanyard', 'Magnet Lanyard'],
  ['items/paddedJacket', 'Padded Jacket'],
  ['items/recoveryTape', 'Recovery Tape'],
  ['status/heart', 'Health'],
  ['status/xp', 'Experience'],
  ['status/note', 'Music notes'],
  ['status/level', 'Level'],
  ['status/pause', 'Pause'],
  ['actions/reroll', 'Reroll'],
  ['actions/shop', 'Shop'],
  ['actions/evolution', 'Evolution'],
  ['actions/weapon-pedestal', 'Weapon choice'],
  ['actions/enemy-skull', 'Enemy skull'],
] as const;

export const PRODUCTION_ENVIRONMENT = [
  ['broken-pillar', 'Broken pillar'],
  ['rune-pillar', 'Rune pillar'],
  ['cyan-brazier', 'Cyan brazier'],
  ['gold-brazier', 'Gold brazier'],
  ['rubble', 'Rubble'],
  ['sarcophagus', 'Sarcophagus'],
  ['hooded-statue', 'Hooded statue'],
  ['knight-statue', 'Knight statue'],
  ['bones', 'Bones'],
  ['mushrooms', 'Mushrooms'],
  ['thorn-vines', 'Thorn vines'],
  ['gravestone', 'Gravestone'],
  ['cyan-crystals', 'Cyan crystals'],
  ['purple-banner', 'Purple banner'],
  ['campfire', 'Campfire'],
  ['rune-dais', 'Rune dais'],
] as const;

function enemyIdleEntry(identity: (typeof PRODUCTION_ENEMIES)[number]): ProductionArtEntry {
  const [id, label] = identity;
  return { id, label, keys: [`actors/enemies/${id}/idle`] };
}

function actorEntry(
  id: string,
  label: string,
  prefix: string,
): ProductionArtEntry {
  return { id, label, keys: [`${prefix}/idle`, `${prefix}/walk`] };
}

function weaponEntry(identity: (typeof PRODUCTION_WEAPONS)[number]): ProductionArtEntry {
  const [id, label] = identity;
  return { id, label, keys: [`weapons/${id}/normal`, `weapons/${id}/evolved`] };
}

function singleEntry(id: string, label: string, prefix: string): ProductionArtEntry {
  return { id, label, keys: [`${prefix}/${id}`] };
}

const enemyIdles = PRODUCTION_ENEMIES.map(enemyIdleEntry);
const actors = [
  actorEntry('player', 'Player', 'actors/player'),
  ...PRODUCTION_ENEMIES.map(([id, label]) => actorEntry(id, label, `actors/enemies/${id}`)),
];
const weapons = PRODUCTION_WEAPONS.map(weaponEntry);
const pickupsAndEffects = [
  ...PRODUCTION_PICKUPS.map(([id, label]) => singleEntry(id, label, 'pickups')),
  ...PRODUCTION_EFFECTS.map(([id, label]) => singleEntry(id, label, 'fx')),
];
const uiIcons = PRODUCTION_UI_ICONS.map(([id, label]) => singleEntry(id, label, 'ui'));
const environment = PRODUCTION_ENVIRONMENT.map(([id, label]) => singleEntry(id, label, 'environment'));

/**
 * Nine fixed 640 x 360 review pages. Large actors and wide attacks are split
 * instead of being shrunk; every atlas pixel therefore remains one logical
 * canvas pixel.
 */
export const PRODUCTION_ART_PAGES = [
  {
    id: 'enemy-idles-1',
    family: 'enemy-idles',
    title: 'ENEMY IDLES · 01–10',
    legend: 'SILHOUETTE LEFT · COLOR RIGHT',
    atlas: 'gameplay',
    presentation: 'silhouette-normal',
    columns: 4,
    rows: 3,
    entries: enemyIdles.slice(0, 10),
  },
  {
    id: 'enemy-idles-2',
    family: 'enemy-idles',
    title: 'ENEMY IDLES · 11–20',
    legend: 'SILHOUETTE LEFT · COLOR RIGHT',
    atlas: 'gameplay',
    presentation: 'silhouette-normal',
    columns: 4,
    rows: 3,
    entries: enemyIdles.slice(10),
  },
  {
    id: 'actor-motion-1',
    family: 'actor-motion',
    title: 'ACTOR MOTION · PLAYER + 01–10',
    legend: 'IDLE LEFT · WALK RIGHT',
    atlas: 'gameplay',
    presentation: 'idle-walk',
    columns: 4,
    rows: 3,
    entries: actors.slice(0, 11),
  },
  {
    id: 'actor-motion-2',
    family: 'actor-motion',
    title: 'ACTOR MOTION · 11–20',
    legend: 'IDLE LEFT · WALK RIGHT',
    atlas: 'gameplay',
    presentation: 'idle-walk',
    columns: 4,
    rows: 3,
    entries: actors.slice(11),
  },
  {
    id: 'weapons-1',
    family: 'weapons',
    title: 'WEAPONS · 01–05',
    legend: 'NORMAL ABOVE · EVOLVED BELOW',
    atlas: 'gameplay',
    presentation: 'normal-evolved',
    columns: 3,
    rows: 2,
    entries: weapons.slice(0, 5),
  },
  {
    id: 'weapons-2',
    family: 'weapons',
    title: 'WEAPONS · 06–09',
    legend: 'NORMAL ABOVE · EVOLVED BELOW',
    atlas: 'gameplay',
    presentation: 'normal-evolved',
    columns: 2,
    rows: 2,
    entries: weapons.slice(5),
  },
  {
    id: 'pickups-effects',
    family: 'pickups-effects',
    title: 'PICKUPS + EFFECTS',
    legend: '6 PICKUPS · 6 EFFECTS',
    atlas: 'gameplay',
    presentation: 'single',
    columns: 4,
    rows: 3,
    entries: pickupsAndEffects,
  },
  {
    id: 'ui-icons',
    family: 'ui-icons',
    title: 'UI ICONS',
    legend: '10 PASSIVES · 5 STATUS · 5 ACTION',
    atlas: 'ui',
    presentation: 'single',
    columns: 5,
    rows: 4,
    entries: uiIcons,
  },
  {
    id: 'environment-props',
    family: 'environment-props',
    title: 'ENVIRONMENT PROPS',
    legend: '16 DECORATIVE PROPS · NATIVE 1×',
    atlas: 'environment',
    presentation: 'single',
    columns: 4,
    rows: 4,
    entries: environment,
  },
] as const satisfies readonly ProductionArtPage[];

export type ProductionArtPageId = (typeof PRODUCTION_ART_PAGES)[number]['id'];

export function isProductionArtPageId(value: string): value is ProductionArtPageId {
  return PRODUCTION_ART_PAGES.some(({ id }) => id === value);
}

export function isProductionArtVisionMode(value: string): value is ProductionArtVisionMode {
  return PRODUCTION_ART_VISION_MODES.some((mode) => mode === value);
}

export function productionArtPage(id: ProductionArtPageId): ProductionArtPage {
  const page = PRODUCTION_ART_PAGES.find((candidate) => candidate.id === id);
  if (!page) throw new Error(`Unknown production-art page ${JSON.stringify(id)}`);
  return page;
}
