// The sandbox is the real arena with automatic waves disabled and a compact,
// deterministic control surface over every live run system. The UI owns no
// persistent progression: its shop always uses MetaStore(null).

import type { MusicEngine } from '../audio/engine';
import { type Role, ROLE_META } from '../audio/kits';
import { sampledRoles } from '../audio/kits/index';
import { supportedRoles } from '../audio/soundset';
import { SLOT_LABEL, slotOf } from './band';
import {
  ALL_ENEMY_KINDS,
  ENEMY_LABELS,
  madForestEnemyStats,
  type EnemyKind,
} from './config';
import { TIER_NUMERALS } from './hud';
import {
  EVOLUTIONS,
  ITEMS,
  ITEM_IDS,
  ITEM_MAX_LEVEL,
  ITEM_NEUTRAL_CSS,
  itemMaxLevel,
  type EvolutionDefinition,
  type ItemId,
} from './items';
import { MetaStore, SHOP_OFFERS, type ShopOfferId } from './meta';
import type { RunWorld } from './run';
import { endlessScale } from './tour';

/** Exported coverage catalogs keep the no-test-framework verification script
 * able to prove that future content cannot silently disappear from the panel. */
export const SANDBOX_ENEMY_CATALOG: readonly EnemyKind[] = ALL_ENEMY_KINDS;
export const SANDBOX_WEAPON_CATALOG: readonly Role[] = Object.freeze(supportedRoles());
export const SANDBOX_ITEM_CATALOG: readonly ItemId[] = ITEM_IDS;
export const SANDBOX_EVOLUTION_CATALOG: readonly EvolutionDefinition[] = Object.freeze(
  Object.values(EVOLUTIONS),
);

type TabId = 'combat' | 'build' | 'career';

export interface SandboxPanel {
  /** Refresh readouts after the world has taken its fixed steps for this frame. */
  update(): void;
  destroy(): void;
}

export interface SandboxOpts {
  onExit: () => void;
  /** The loadout changed (force-assembly): keep the rack and track overlay in sync. */
  onLoadout?: () => void;
}

interface ChoiceButtons<T> {
  value: () => T;
  options: Array<{ value: T; button: HTMLButtonElement }>;
}

function formatStat(value: number): string {
  if (value >= 10_000) return `${(value / 1000).toFixed(value >= 100_000 ? 0 : 1)}k`;
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function mountSandboxPanel(
  root: HTMLElement,
  engine: MusicEngine,
  world: RunWorld,
  opts: SandboxOpts,
): SandboxPanel {
  // Explicitly null: career experiments must never read or write localStorage.
  const career = new MetaStore(null);
  let creditedRunNotes = world.notesCollected;
  let activeTab: TabId = 'combat';
  let collapsed = false;
  let lastStatsKey = '';

  const panel = document.createElement('div');
  panel.className = 'sandbox-panel';
  // The live item rack occupies this corner at z3; the developer panel must be
  // the topmost interactive surface. Inline sizing also keeps four tabs usable
  // on phones without requiring a second CSS layout.
  panel.style.zIndex = '7';
  panel.style.width = 'min(420px, calc(100vw - 24px))';
  root.appendChild(panel);

  const el = (
    tag: string,
    className: string,
    parent: HTMLElement,
    text = '',
  ): HTMLElement => {
    const node = document.createElement(tag);
    node.className = className;
    if (text) node.textContent = text;
    parent.appendChild(node);
    return node;
  };

  const button = (parent: HTMLElement, text: string, action: () => void): HTMLButtonElement => {
    const node = el('button', 'small', parent, text) as HTMLButtonElement;
    node.onclick = () => {
      action();
      refresh();
      node.blur();
    };
    return node;
  };

  const section = (parent: HTMLElement, title: string): HTMLElement => {
    el('div', 'sb-section', parent, title);
    return parent;
  };

  const head = el('div', 'sb-head', panel);
  el('span', 'sb-title', head, 'SYSTEM SANDBOX');
  const headActions = el('div', 'sb-head-actions', head);
  let collapseButton: HTMLButtonElement;
  collapseButton = button(headActions, '− panel', () => {
    collapsed = !collapsed;
    panel.classList.toggle('collapsed', collapsed);
    collapseButton.textContent = collapsed ? '+ panel' : '− panel';
    collapseButton.setAttribute('aria-expanded', String(!collapsed));
  });
  collapseButton.setAttribute('aria-expanded', 'true');
  button(headActions, '← leave', opts.onExit);

  const tabBar = el('div', 'sb-btns sb-controls', panel);
  tabBar.style.marginLeft = '0';
  tabBar.style.display = 'grid';
  tabBar.style.gridTemplateColumns = 'repeat(3, minmax(0, 1fr))';
  const tabButtons = new Map<TabId, HTMLButtonElement>();
  const pages = new Map<TabId, HTMLElement>();
  const tabLabels: Array<[TabId, string]> = [
    ['combat', 'Combat'],
    ['build', 'Build'],
    ['career', 'Career'],
  ];
  for (const [id, label] of tabLabels) {
    const tab = button(tabBar, label, () => setTab(id));
    tabButtons.set(id, tab);
    const page = el('div', `sb-page sb-page-${id}`, panel);
    page.style.display = id === activeTab ? 'flex' : 'none';
    page.style.flexDirection = 'column';
    page.style.gap = '6px';
    pages.set(id, page);
  }

  const combat = pages.get('combat')!;
  const build = pages.get('build')!;
  const careerPage = pages.get('career')!;

  // -----------------------------------------------------------------------
  // Combat: exact threat minute, complete enemy catalog, repeatable fixtures.

  section(combat, 'threat minute');
  const threatChoices = [0, 5, 8, 12, 20, 30] as const;
  const threatRow = el('div', 'sb-enemy', combat);
  const threatInfo = el('div', 'sb-enemy-info', threatRow);
  el('span', 'sb-enemy-name', threatInfo, 'endless scale');
  const threatStatus = el('span', 'sb-enemy-stats', threatInfo);
  const threatButtons = el('div', 'sb-btns', threatRow);
  const threatChoice: ChoiceButtons<number> = {
    value: () => Math.floor(world.timeS / 60),
    options: threatChoices.map((minute) => ({
      value: minute,
      button: button(threatButtons, String(minute), () => world.setSandboxThreatMinute(minute)),
    })),
  };

  const levelChoices = [1, 5, 10, 20, 40] as const;
  const levelRow = el('div', 'sb-enemy', combat);
  const levelInfo = el('div', 'sb-enemy-info', levelRow);
  el('span', 'sb-enemy-name', levelInfo, 'player level');
  const levelStatus = el('span', 'sb-enemy-stats', levelInfo);
  const levelButtons = el('div', 'sb-btns', levelRow);
  const levelChoice: ChoiceButtons<number> = {
    value: () => world.level,
    options: levelChoices.map((level) => ({
      value: level,
      button: button(levelButtons, String(level), () => {
        world.level = level;
      }),
    })),
  };

  const fixtureControls = el('div', 'sb-btns sb-controls', combat);
  fixtureControls.style.marginLeft = '0';
  button(fixtureControls, 'ELITE BOSS', () => world.spawnSandboxBoss('mantis'));
  button(fixtureControls, 'MINUTE WAVE', () => world.spawnSandboxWave());
  button(fixtureControls, 'SPAWN DUMMY', () => {
    world.spawnEnemyAt('dummy', world.player.x + 190, world.player.y);
  });
  button(fixtureControls, 'CLEAR DUMMIES', () => world.clearDummies());
  const invulnButton = button(fixtureControls, 'INVULN', () => {
    world.invincible = !world.invincible;
  });
  button(fixtureControls, 'CLEAR ALL', () => {
    engine.clearBarQueue();
    world.clearSandboxEntities();
  });

  section(combat, 'complete enemy catalog');
  const enemyStats = new Map<EnemyKind, HTMLElement>();
  for (const kind of SANDBOX_ENEMY_CATALOG) {
    const row = el('div', 'sb-enemy', combat);
    const info = el('div', 'sb-enemy-info', row);
    const name = el('span', 'sb-enemy-name', info, ENEMY_LABELS[kind]);
    name.title = kind;
    enemyStats.set(kind, el('span', 'sb-enemy-stats', info));
    const controls = el('div', 'sb-btns', row);
    button(controls, 'near', () => {
      world.spawnEnemyAt(kind, world.player.x + 190, world.player.y);
    });
    button(controls, '×8', () => {
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        world.spawnEnemyAt(
          kind,
          world.player.x + Math.cos(angle) * 245,
          world.player.y + Math.sin(angle) * 185,
        );
      }
    });
    button(controls, 'ring', () => world.spawnRingOf(kind, 24));
  }

  // -----------------------------------------------------------------------
  // Build: all supported weapons, all passives, every complete evolution.

  section(build, 'band controls');
  const instrumentNames = SANDBOX_WEAPON_CATALOG.map((role) => ROLE_META[role].name);
  el('div', 'sb-hint', build, `${instrumentNames.length} live weapons: ${instrumentNames.join(', ')}`);
  const bandControls = el('div', 'sb-btns sb-controls', build);
  bandControls.style.marginLeft = '0';
  button(bandControls, 'FULL BAND IV', () => {
    for (const role of SANDBOX_WEAPON_CATALOG) {
      engine.setVoiceTier(role, 4);
      engine.setVoiceEnabled(role, true);
      world.addWeapon(role, 4);
    }
    opts.onLoadout?.();
  });
  button(bandControls, 'CLEAR WEAPONS', () => {
    for (const role of SANDBOX_WEAPON_CATALOG) setWeaponTier(role, 0);
  });

  const weaponButtons = new Map<Role, ChoiceButtons<number>>();
  const custom = sampledRoles();
  for (const role of SANDBOX_WEAPON_CATALOG) {
    const voice = engine.voices.get(role);
    if (!voice) continue;
    const row = el('div', 'sb-loadout', build);
    row.style.setProperty('--voice-color', voice.kit.color);
    const info = el('div', 'sb-enemy-info', row);
    const label = el('span', `sb-loadout-label ${custom.has(role) ? 'custom' : ''}`, info, voice.kit.name);
    label.title = `${SLOT_LABEL[slotOf(role)]} slot${custom.has(role) ? ' · sample-backed' : ''}`;
    el('span', 'sb-enemy-stats', info, SLOT_LABEL[slotOf(role)]);
    const controls = el('div', 'sb-btns', row);
    const choices: ChoiceButtons<number> = { value: () => world.tiers.get(role) ?? 0, options: [] };
    choices.options.push({ value: 0, button: button(controls, '⏻', () => setWeaponTier(role, 0)) });
    for (let tier = 1; tier <= 4; tier++) {
      choices.options.push({
        value: tier,
        button: button(controls, TIER_NUMERALS[tier - 1], () => setWeaponTier(role, tier)),
      });
    }
    weaponButtons.set(role, choices);
  }

  section(build, 'passive items');
  const itemButtons = new Map<ItemId, ChoiceButtons<number>>();
  const itemControls = el('div', 'sb-btns sb-controls', build);
  itemControls.style.marginLeft = '0';
  button(itemControls, 'ALL V', () => {
    for (const id of SANDBOX_ITEM_CATALOG) setItemLevel(id, itemMaxLevel(id));
  });
  button(itemControls, 'CLEAR ITEMS', () => {
    for (const id of SANDBOX_ITEM_CATALOG) setItemLevel(id, 0);
  });
  for (const id of SANDBOX_ITEM_CATALOG) {
    const item = ITEMS[id];
    const row = el('div', 'sb-loadout', build);
    row.style.setProperty('--voice-color', ITEM_NEUTRAL_CSS);
    const info = el('div', 'sb-enemy-info', row);
    const name = el('span', 'sb-loadout-label', info, `${item.glyph} ${item.name}`);
    name.title = item.description;
    const partner = item.evolutionPartner;
    el(
      'span',
      'sb-enemy-stats passive-copy',
      info,
      `${item.description} · ${partner ? `evolves ${ROLE_META[partner].name}` : 'standalone · no evolution'}`,
    );
    const controls = el('div', 'sb-btns', row);
    const choices: ChoiceButtons<number> = { value: () => world.items.get(id) ?? 0, options: [] };
    for (let level = 0; level <= itemMaxLevel(id); level++) {
      choices.options.push({
        value: level,
        button: button(controls, level === 0 ? '⏻' : String(level), () => setItemLevel(id, level)),
      });
    }
    itemButtons.set(id, choices);
  }

  section(build, 'evolution recipes · click to toggle');
  const evolutionButtons = new Map<Role, HTMLButtonElement>();
  for (const evolution of SANDBOX_EVOLUTION_CATALOG) {
    const row = el('div', 'sb-loadout', build);
    row.style.setProperty('--voice-color', `#${evolution.color.toString(16).padStart(6, '0')}`);
    const info = el('div', 'sb-enemy-info', row);
    const name = el('span', 'sb-loadout-label', info, evolution.name);
    name.title = evolution.description;
    el(
      'span',
      'sb-enemy-stats',
      info,
      `${ROLE_META[evolution.role].name} IV + ${ITEMS[evolution.item].name} V`,
    );
    const controls = el('div', 'sb-btns', row);
    const evolveButton = button(controls, 'EVOLVE', () => toggleEvolution(evolution));
    evolutionButtons.set(evolution.role, evolveButton);
  }

  const buildReadout = el('div', 'sb-hint', build);

  // -----------------------------------------------------------------------
  // Career: disposable wallet + real shop rules + physical pickup tests.

  section(careerPage, 'isolated career profile');
  el(
    'div',
    'sb-hint',
    careerPage,
    'IN-MEMORY ONLY · purchases and note grants here never touch your real collection.',
  );
  const walletReadout = el('div', 'sb-enemy-name', careerPage);
  const careerControls = el('div', 'sb-btns sb-controls', careerPage);
  careerControls.style.marginLeft = '0';
  button(careerControls, '+100 NOTES', () => career.grantNotes(100));
  button(careerControls, '+1000 NOTES', () => career.grantNotes(1000));
  button(careerControls, '+5000 NOTES', () => career.grantNotes(5000));

  section(careerPage, 'physical pickups');
  const noteControls = el('div', 'sb-btns sb-controls sb-pickup-controls', careerPage);
  noteControls.style.marginLeft = '0';
  button(noteControls, 'DROP ♫1', () => dropNote(1, 100));
  button(noteControls, 'DROP ♫3', () => dropNote(3, 125));
  button(noteControls, 'DROP ♫10', () => dropNote(10, 150));
  button(noteControls, 'NOTE SHOWER', () => {
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      world.spawnMusicNoteAt(
        world.player.x + Math.cos(angle) * 125,
        world.player.y + Math.sin(angle) * 95,
        i % 6 === 0 ? 3 : 1,
      );
    }
  });
  button(noteControls, 'DROP STAGE MAGNET', () => {
    world.spawnStageMagnetAt(world.player.x + 115, world.player.y);
  });
  button(noteControls, 'DROP CHEST', () => {
    world.spawnChestAt(world.player.x + 115, world.player.y);
  });
  button(noteControls, 'PICKUP FIELD', () => {
    for (let i = 0; i < 18; i++) {
      const angle = (i / 18) * Math.PI * 2;
      const x = world.player.x + Math.cos(angle) * 210;
      const y = world.player.y + Math.sin(angle) * 135;
      if (i % 3 === 0) world.spawnMusicNoteAt(x, y, i === 0 ? 3 : 1);
      else world.spawnGemAt(x, y, i % 5 === 0 ? 3 : 1);
    }
  });
  button(noteControls, 'TRIGGER VACUUM', () => world.vacuumVisiblePickups());
  const pickupReadout = el('div', 'sb-hint', careerPage);

  section(careerPage, 'afterhours shop');
  const shopButtons = new Map<ShopOfferId, HTMLButtonElement>();
  for (const offer of SHOP_OFFERS) {
    const row = el('div', 'sb-loadout', careerPage);
    const info = el('div', 'sb-enemy-info', row);
    const name = el('span', 'sb-enemy-name', info, offer.name);
    name.title = offer.description;
    el('span', 'sb-enemy-stats', info, `${offer.kind} · ♫ ${offer.cost} · shelf ${offer.minOwned}`);
    const controls = el('div', 'sb-btns', row);
    const buy = button(controls, 'BUY', () => {
      career.purchase(offer.id);
    });
    shopButtons.set(offer.id, buy);
  }

  el(
    'div',
    'sb-hint',
    panel,
    'Stage spawns are off. O = perf, C = track, K = clear visible, 1–7 = mute a band slot.',
  );

  function setTab(id: TabId): void {
    activeTab = id;
    for (const [tabId, page] of pages) page.style.display = tabId === id ? 'flex' : 'none';
    for (const [tabId, tab] of tabButtons) tab.classList.toggle('on', tabId === id);
  }

  function clearEvolution(role: Role): void {
    world.clearEvolutionForSandbox(role);
    engine.clearEvolutionGain(role);
  }

  function setWeaponTier(role: Role, tier: number): void {
    const next = Math.max(0, Math.min(4, Math.floor(tier)));
    if (next === 0) {
      clearEvolution(role);
      engine.setVoiceEnabled(role, false);
      world.removeWeapon(role);
    } else {
      if (next < 4) clearEvolution(role);
      engine.setVoiceTier(role, next);
      engine.setVoiceEnabled(role, true);
      world.addWeapon(role, next);
    }
    opts.onLoadout?.();
  }

  function setItemLevel(id: ItemId, level: number): void {
    const next = Math.max(0, Math.min(itemMaxLevel(id), Math.floor(level)));
    world.setItemLevelForSandbox(id, next);
    const partner = ITEMS[id].evolutionPartner;
    if (partner && next < ITEM_MAX_LEVEL) clearEvolution(partner);
    opts.onLoadout?.();
  }

  function toggleEvolution(evolution: EvolutionDefinition): void {
    if (world.evolved.has(evolution.role)) {
      clearEvolution(evolution.role);
      opts.onLoadout?.();
      return;
    }
    setWeaponTier(evolution.role, 4);
    setItemLevel(evolution.item, ITEM_MAX_LEVEL);
    const made = world.evolve(evolution.role);
    if (made) engine.setEvolutionGain(evolution.role, evolution.gainDb);
    opts.onLoadout?.();
  }

  function dropNote(value: number, radius: number): void {
    world.spawnMusicNoteAt(world.player.x + radius, world.player.y, value);
  }

  function syncChoice<T>(choice: ChoiceButtons<T>): void {
    const selected = choice.value();
    for (const option of choice.options) option.button.classList.toggle('on', option.value === selected);
  }

  function refreshStats(): void {
    const minute = Math.floor(world.timeS / 60);
    const key = `${minute}/${world.level}`;
    if (key === lastStatsKey) return;
    lastStatsKey = key;
    const scale = endlessScale(minute);
    for (const [kind, node] of enemyStats) {
      const base = madForestEnemyStats(kind, world.level);
      node.textContent =
        `hp ${formatStat(base.hp * scale.hpMul)} · dmg ${formatStat(base.damage * scale.damageMul)}` +
        ` · spd ${formatStat(base.speed * scale.speedMul)} · xp ${formatStat(base.xp * scale.xpMul)}`;
    }
  }

  function refreshCareer(): void {
    if (world.notesCollected < creditedRunNotes) creditedRunNotes = world.notesCollected;
    if (world.notesCollected > creditedRunNotes) {
      career.grantNotes(world.notesCollected - creditedRunNotes);
      creditedRunNotes = world.notesCollected;
    }
    const collection = career.collection();
    walletReadout.textContent = `♫ ${career.state.notes} · ${collection.owned}/${collection.total} shop unlocks`;
    pickupReadout.textContent =
      `${world.gems.length} XP gems · ${world.musicNotes.length} notes · ` +
      `${world.stageMagnets.length} Stage Magnet${world.stageMagnets.length === 1 ? '' : 's'} on floor · ` +
      `${world.notesCollected} notes collected`;
    const states = new Map(career.shop().map((state) => [state.offer.id, state]));
    for (const offer of SHOP_OFFERS) {
      const state = states.get(offer.id)!;
      const buy = shopButtons.get(offer.id)!;
      buy.disabled = state.purchased || state.shelfLocked || !state.affordable;
      buy.classList.toggle('on', state.purchased);
      buy.textContent = state.purchased
        ? 'OWNED'
        : state.shelfLocked
          ? `LOCK ${state.purchasesNeeded}`
          : state.affordable
            ? `BUY ♫${offer.cost}`
            : `NEED ♫${offer.cost}`;
    }
  }

  function refresh(): void {
    setTab(activeTab);
    syncChoice(threatChoice);
    syncChoice(levelChoice);
    for (const choice of weaponButtons.values()) syncChoice(choice);
    for (const choice of itemButtons.values()) syncChoice(choice);
    invulnButton.classList.toggle('on', world.invincible);
    invulnButton.textContent = `INVULN ${world.invincible ? 'ON' : 'OFF'}`;
    threatStatus.textContent = `minute ${Math.floor(world.timeS / 60)} · freshly spawned enemies use this scale`;
    levelStatus.textContent = `level ${world.level} · HP ${Math.ceil(world.player.hp)}/${world.playerMaxHp}`;
    for (const evolution of SANDBOX_EVOLUTION_CATALOG) {
      const evolved = world.evolved.has(evolution.role);
      const control = evolutionButtons.get(evolution.role)!;
      control.classList.toggle('on', evolved);
      control.textContent = evolved ? 'CLEAR EVO' : 'EVOLVE';
    }
    const mods = world.buildMods;
    buildReadout.textContent =
      `build: move ×${mods.moveMul.toFixed(2)} · damage ×${mods.damageMul.toFixed(2)}` +
      ` · speed ×${mods.projectileSpeedMul.toFixed(2)} · pierce +${mods.extraPierce}` +
      ` · bounce ${mods.bounceCount} · area ×${mods.areaMul.toFixed(2)}` +
      ` · regen ${mods.hpRegenPerSecond.toFixed(1)} HP/s`;
    refreshStats();
    refreshCareer();
  }

  refresh();

  return {
    update: refresh,
    destroy(): void {
      panel.remove();
    },
  };
}
