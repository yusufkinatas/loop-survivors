// The sandbox is the real arena with automatic waves disabled and a compact,
// deterministic control surface over every live run system. The UI owns no
// persistent progression: its shop always uses MetaStore(null).

import type { MusicEngine } from '../audio/engine';
import { type Role, ROLE_META } from '../audio/kits';
import { sampledRoles } from '../audio/kits/index';
import { supportedRoles } from '../audio/soundset';
import {
  ALL_ENEMY_KINDS,
  ENEMIES,
  ENEMY_LABELS,
  type EnemyKind,
} from './config';
import {
  TUNABLE_FIELDS,
  enemyStats,
  exportTuning,
  fieldRange,
  isFieldTuned,
  isTuned,
  resetTuning,
  resetTuningField,
  setTuning,
  shippedValue,
  tunedKindCount,
  tunedValue,
  type TunableField,
  type TunableKey,
} from './enemy-tuning';
import { TIER_NUMERALS } from './hud';
import {
  EVOLUTION_BY_ROLE,
  ITEMS,
  ITEM_IDS,
  ITEM_NEUTRAL_CSS,
  itemMaxLevel,
  type EvolutionDefinition,
  type ItemId,
} from './items';
import { MetaStore, SHOP_OFFERS, type ShopOfferId } from './meta';
import type { RunWorld } from './run';
import { WEAPON_MAX_LEVEL, chartStageForLevel } from './weapons/levels';

/** Exported coverage catalogs keep the no-test-framework verification script
 * able to prove that future content cannot silently disappear from the panel. */
const SANDBOX_ENEMY_CATALOG: readonly EnemyKind[] = ALL_ENEMY_KINDS;
const SANDBOX_WEAPON_CATALOG: readonly Role[] = Object.freeze(supportedRoles());
const SANDBOX_ITEM_CATALOG: readonly ItemId[] = ITEM_IDS;

/** The ★ rung's value in a weapon row's ChoiceButtons. One past the top weapon
 *  level so it sorts and reads as the end of the ladder; it is NOT a tier the
 *  game has, and nothing outside this panel should treat it as one. */
const EVOLVED_RUNG = WEAPON_MAX_LEVEL + 1;

type TabId = 'combat' | 'enemies' | 'build' | 'career';

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
  /** Bumped on every lab edit so the cached catalog readout re-derives. */
  let tuningRevision = 0;

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
  tabBar.style.gridTemplateColumns = 'repeat(4, minmax(0, 1fr))';
  const tabButtons = new Map<TabId, HTMLButtonElement>();
  const pages = new Map<TabId, HTMLElement>();
  const tabLabels: Array<[TabId, string]> = [
    ['combat', 'Combat'],
    ['enemies', 'Lab'],
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
  const lab = pages.get('enemies')!;
  const build = pages.get('build')!;
  const careerPage = pages.get('career')!;

  // -----------------------------------------------------------------------
  // Combat: exact stage minute, complete enemy catalog, repeatable fixtures.

  section(combat, 'stage minute');
  const threatChoices = [0, 5, 8, 12, 20, 30] as const;
  const threatRow = el('div', 'sb-enemy', combat);
  const threatInfo = el('div', 'sb-enemy-info', threatRow);
  el('span', 'sb-enemy-name', threatInfo, 'wave table');
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
  button(fixtureControls, 'BOSS SPAWN', () => world.spawnSandboxBoss('mantis'));
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
  const enemyStatNodes = new Map<EnemyKind, HTMLElement>();
  for (const kind of SANDBOX_ENEMY_CATALOG) {
    const row = el('div', 'sb-enemy', combat);
    const info = el('div', 'sb-enemy-info', row);
    const name = el('span', 'sb-enemy-name', info, ENEMY_LABELS[kind]);
    name.title = kind;
    enemyStatNodes.set(kind, el('span', 'sb-enemy-stats', info));
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
  // Enemy lab: edit one kind's base numbers with its horde on the screen.
  //
  // One kind at a time, not a wall of every kind's every stat: the roster is
  // twenty deep and six fields wide, and a 420px panel that shows all 120 at
  // once shows none of them usefully. Picking a target first also gives the
  // spawn buttons an obvious subject.

  section(lab, 'tuning target');
  const labBanner = el('div', 'sb-hint', lab);
  labBanner.style.marginTop = '0';
  const kindGrid = el('div', 'sb-kind-grid', lab);
  const kindButtons = new Map<EnemyKind, HTMLButtonElement>();
  // The stage's opening enemy: the one whose feel is judged most often.
  let labKind: EnemyKind = 'redBat2';
  for (const kind of SANDBOX_ENEMY_CATALOG) {
    const pick = button(kindGrid, ENEMY_LABELS[kind], () => {
      labKind = kind;
    });
    pick.title = kind;
    kindButtons.set(kind, pick);
  }

  const labSpawn = el('div', 'sb-btns sb-controls', lab);
  labSpawn.style.marginLeft = '0';
  button(labSpawn, 'NEAR', () => {
    world.spawnEnemyAt(labKind, world.player.x + 190, world.player.y);
  });
  button(labSpawn, '×8', () => {
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      world.spawnEnemyAt(
        labKind,
        world.player.x + Math.cos(angle) * 245,
        world.player.y + Math.sin(angle) * 185,
      );
    }
  });
  button(labSpawn, 'RING ×24', () => world.spawnRingOf(labKind, 24));
  button(labSpawn, 'CLEAR FIELD', () => {
    engine.clearBarQueue();
    world.clearSandboxEntities();
  });

  section(lab, 'base stats');
  // The one and only scaling rule, stated ONCE for the whole tab. Every row
  // used to carry its own scaled number, which read as a second copy of the
  // value in the box rather than as "and this is what actually spawns".
  const scaleNote = el('div', 'sb-hint', lab);
  scaleNote.style.marginTop = '0';
  interface TuneRow {
    field: TunableField;
    slider: HTMLInputElement;
    number: HTMLInputElement;
    reset: HTMLButtonElement;
    readout: HTMLElement;
  }
  const tuneRows: TuneRow[] = [];
  for (const field of TUNABLE_FIELDS) {
    const row = el('div', 'sb-tune', lab);
    const headRow = el('div', 'sb-tune-head', row);
    const label = el('span', 'sb-tune-label', headRow, field.label);
    label.title = field.hint;
    const number = document.createElement('input');
    number.type = 'number';
    number.className = 'sb-tune-num';
    headRow.appendChild(number);
    const track = el('div', 'sb-tune-track', row);
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.className = 'sb-tune-slider';
    track.appendChild(slider);
    // Per-field revert. Sits at the end of its own slider so the thing it
    // undoes is unambiguous; RESET KIND below still drops the whole set.
    const reset = button(track, '↺', () => {
      resetTuningField(labKind, field.key);
      tuningRevision++;
      world.retuneAliveEnemies();
    });
    reset.classList.add('sb-tune-reset');
    const readout = el('span', 'sb-enemy-stats', row);
    // 'input' not 'change': the horde must move while the slider is moving,
    // which is the entire reason this is a slider and not a text box.
    slider.oninput = () => applyTuning(field.key, Number(slider.value));
    number.onchange = () => applyTuning(field.key, Number(number.value));
    tuneRows.push({ field, slider, number, reset, readout });
  }

  const labActions = el('div', 'sb-btns sb-controls', lab);
  labActions.style.marginLeft = '0';
  const resetKindButton = button(labActions, 'RESET KIND', () => {
    resetTuning(labKind);
    tuningRevision++;
    world.retuneAliveEnemies();
  });
  const resetAllButton = button(labActions, 'RESET ALL', () => {
    resetTuning(null);
    tuningRevision++;
    world.retuneAliveEnemies();
  });
  const exportButton = button(labActions, 'COPY CONFIG', () => {
    copyExport();
  });
  const labFooter = el('div', 'sb-hint', lab);
  labFooter.textContent =
    'Edits are live: the horde already on screen retunes as you drag, keeping the ' +
    'damage it has taken. They also persist across reloads and apply to ordinary ' +
    'runs — COPY CONFIG gives you pasteable config.ts, RESET ALL puts the shipped ' +
    'numbers back.';
  const exportStatus = el('div', 'sb-hint', lab);

  // -----------------------------------------------------------------------
  // Build: all supported weapons, all passives, every complete evolution.

  section(build, 'band controls');
  const instrumentNames = SANDBOX_WEAPON_CATALOG.map((role) => ROLE_META[role].name);
  el('div', 'sb-hint', build, `${instrumentNames.length} live weapons: ${instrumentNames.join(', ')}`);
  const bandControls = el('div', 'sb-btns sb-controls', build);
  bandControls.style.marginLeft = '0';
  button(bandControls, `FULL BAND ${TIER_NUMERALS[WEAPON_MAX_LEVEL - 1]}`, () => {
    for (const role of SANDBOX_WEAPON_CATALOG) {
      engine.setVoiceTier(role, chartStageForLevel(WEAPON_MAX_LEVEL));
      engine.setVoiceEnabled(role, true);
      world.addWeapon(role, WEAPON_MAX_LEVEL);
    }
    opts.onLoadout?.();
  });
  button(bandControls, 'CLEAR WEAPONS', () => {
    for (const role of SANDBOX_WEAPON_CATALOG) setWeaponTier(role, 0);
  });

  // One weapon = one row = one ladder: off, I–VIII, then ★ for the evolved
  // form. The evolve control used to live in its own section far below every
  // weapon and every passive, so taking a single weapon from off to evolved
  // meant scrolling past the entire tab and back for each weapon in turn.
  //
  // ★ IS PRESENTED AS ONE RUNG PAST THE TOP LEVEL, which the real game does not
  // have — evolving is a recipe (max weapon level plus the partner passive
  // owned), not the top of the level ladder. The panel does not model that.
  // Here the question is only ever "show me this weapon in this state", and one
  // row of mutually exclusive states answers it in one click. The recipe still
  // governs real runs; see RunWorld.evolve, which this path does not go through.
  const weaponButtons = new Map<Role, ChoiceButtons<number>>();
  const custom = sampledRoles();
  for (const role of SANDBOX_WEAPON_CATALOG) {
    const voice = engine.voices.get(role);
    if (!voice) continue;
    const row = el('div', 'sb-loadout', build);
    row.style.setProperty('--voice-color', voice.kit.color);
    const info = el('div', 'sb-enemy-info', row);
    const label = el('span', `sb-loadout-label ${custom.has(role) ? 'custom' : ''}`, info, voice.kit.name);
    if (custom.has(role)) label.title = 'sample-backed';
    const controls = el('div', 'sb-btns sb-ladder', row);
    // EVOLVED_RUNG is the selected value when the weapon is evolved, so ★ and
    // the tier buttons are one exclusive set and the highlight cannot land on
    // two rungs at once.
    const choices: ChoiceButtons<number> = {
      value: () => (world.evolved.has(role) ? EVOLVED_RUNG : world.tiers.get(role) ?? 0),
      options: [],
    };
    choices.options.push({ value: 0, button: button(controls, '⏻', () => setWeaponTier(role, 0)) });
    for (let tier = 1; tier <= WEAPON_MAX_LEVEL; tier++) {
      choices.options.push({
        value: tier,
        button: button(controls, TIER_NUMERALS[tier - 1], () => setWeaponTier(role, tier)),
      });
    }
    // The lookup is Partial by design, so a weapon may legitimately have no
    // evolution. Every supported weapon has one today; if that ever changes the
    // row simply ends after VIII rather than growing a dead button.
    const evolution = EVOLUTION_BY_ROLE[role];
    if (!evolution) continue;
    const star = button(controls, '★', () => setWeaponEvolved(role, evolution));
    star.classList.add('sb-evo-rung');
    // The row has no space for the recipe, and in here it is not a requirement
    // anyway — so it moves into the tooltip as context rather than as a gate.
    star.title =
      `${evolution.name} — ${evolution.description}\n` +
      `In a run: ${ROLE_META[role].name} ${TIER_NUMERALS[WEAPON_MAX_LEVEL - 1]} + ` +
      `${ITEMS[evolution.item].name} at any level. ` +
      `In the sandbox neither is needed.`;
    choices.options.push({ value: EVOLVED_RUNG, button: star });
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
  button(noteControls, 'DROP HEALTH', () => {
    world.spawnHealthPickupAt(world.player.x + 115, world.player.y + 60);
  });
  // Random weights, then the three pinned payouts (×5 = the jackpot ceremony).
  // A ready evolution still outranks a pinned size, exactly like a real run.
  button(noteControls, 'DROP CHEST', () => {
    world.spawnChestAt(world.player.x + 115, world.player.y);
  });
  for (const size of [1, 3, 5] as const) {
    button(noteControls, `DROP CHEST ×${size}`, () => {
      world.spawnChestAt(world.player.x + 115, world.player.y).forceSize = size;
    });
  }
  button(noteControls, 'PICKUP FIELD', () => {
    for (let i = 0; i < 18; i++) {
      const angle = (i / 18) * Math.PI * 2;
      const x = world.player.x + Math.cos(angle) * 210;
      const y = world.player.y + Math.sin(angle) * 135;
      if (i % 3 === 0) world.spawnMusicNoteAt(x, y, i === 0 ? 3 : 1);
      else world.spawnGemAt(x, y, i % 5 === 0 ? 3 : 1);
    }
  });
  button(noteControls, 'TRIGGER VACUUM', () => world.vacuumAllPickups());
  // A straight line of gems to walk down: the way to hear the pickup cue's
  // pitch climb as the XP bar fills, and the stereo sweep a dense run of
  // pickups produces. Tight spacing so one walk-through plays the whole shape.
  button(noteControls, 'GEM TRAIL', () => {
    for (let i = 0; i < 24; i++) {
      world.spawnGemAt(world.player.x + 70 + i * 46, world.player.y, 1);
    }
  });
  // The same walk, for notes: the way to hear the note cue's ladder climb one
  // scale step per pickup, and reset to the root once you stop. Spaced wider
  // than the gem trail on purpose — the ladder resets after a pause, so the
  // walk has to be brisk enough to keep the climb alive, and that gap is
  // exactly the thing worth feeling out.
  button(noteControls, 'NOTE TRAIL', () => {
    for (let i = 0; i < 24; i++) {
      world.spawnMusicNoteAt(world.player.x + 70 + i * 58, world.player.y, 1);
    }
  });
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

  /** One edit: store it, bring the live horde in line, redraw the readouts. */
  function applyTuning(key: TunableKey, value: number): void {
    if (!Number.isFinite(value)) return;
    setTuning(labKind, key, value);
    tuningRevision++;
    world.retuneAliveEnemies();
    refresh();
  }

  function copyExport(): void {
    const text = exportTuning();
    const kinds = tunedKindCount();
    // Clipboard access needs a secure context, which a dev server reached over
    // plain http (a phone on the LAN) does not have. The console fallback means
    // a session's tuning is never trapped in the panel.
    const logged = (): void => {
      console.log(text);
      exportStatus.textContent = 'Clipboard unavailable — the config block was logged to the console.';
    };
    const write = navigator.clipboard?.writeText(text);
    if (!write) {
      logged();
      return;
    }
    void write.then(() => {
      exportStatus.textContent = `Copied ${kinds} tuned kind(s) — paste into ENEMIES in src/game/config.ts.`;
    }, logged);
  }

  function refreshLab(): void {
    const tuned = tunedKindCount();
    labBanner.textContent = tuned === 0
      ? 'Every kind is at its shipped values.'
      : `${tuned} kind(s) tuned — runs outside this sandbox use these numbers too.`;
    labBanner.classList.toggle('sb-warn', tuned > 0);
    for (const [kind, pick] of kindButtons) {
      pick.classList.toggle('on', kind === labKind);
      // A dot, not a colour: the picker is already a dense grid of toggles.
      pick.textContent = isTuned(kind) ? `• ${ENEMY_LABELS[kind]}` : ENEMY_LABELS[kind];
    }
    scaleNote.textContent = ENEMIES[labKind].hpPerLevel
      ? `Base values. ${ENEMY_LABELS[labKind]} carries HP×Level, so it spawns with `
        + `health ×${Math.max(1, world.level)} at player level ${world.level}. `
        + 'Nothing else scales — the clock changes nothing.'
      : 'Base values. This is exactly what spawns, at any minute and any player '
        + 'level: HP×Level is the only scaling in the game, and this kind '
        + 'does not carry it.';
    for (const { field, slider, number, reset, readout } of tuneRows) {
      const { min, max, step } = fieldRange(labKind, field);
      const value = tunedValue(labKind, field.key);
      const shipped = shippedValue(labKind, field.key);
      slider.min = String(min);
      slider.max = String(max);
      slider.step = String(step);
      number.min = String(min);
      // Deliberately no max: the box is the way past the slider's comfortable
      // range, and fieldRange grows the slider to meet whatever is typed.
      number.step = String(step);
      // Never fight the control the designer is currently holding: writing to a
      // focused number input would move the caret mid-type.
      if (document.activeElement !== slider) slider.value = String(value);
      if (document.activeElement !== number) number.value = String(Number(value.toFixed(3)));
      const changed = isFieldTuned(labKind, field.key);
      slider.classList.toggle('tuned', changed);
      number.classList.toggle('tuned', changed);
      // Nothing to revert to on an untouched field, so the control says so
      // rather than sitting there as a live-looking no-op.
      reset.disabled = !changed;
      reset.title = changed
        ? `Back to the shipped ${field.label}: ${formatStat(shipped)}`
        : `${field.label} is at its shipped value (${formatStat(shipped)})`;
      readout.textContent = `shipped ${formatStat(shipped)} · ${field.hint}`;
    }
    resetKindButton.disabled = !isTuned(labKind);
    resetAllButton.disabled = tuned === 0;
    exportButton.disabled = tuned === 0;
  }

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
    const next = Math.max(0, Math.min(WEAPON_MAX_LEVEL, Math.floor(tier)));
    // ALWAYS clears the evolution, including for the top rung. The rungs are
    // one exclusive set, so picking any numbered tier means "show me the base
    // weapon at this tier" — landing on VIII *while still evolved* would leave
    // the row highlighting a rung the field does not match.
    clearEvolution(role);
    if (next === 0) {
      engine.setVoiceEnabled(role, false);
      world.removeWeapon(role);
    } else {
      engine.setVoiceTier(role, chartStageForLevel(next));
      engine.setVoiceEnabled(role, true);
      world.addWeapon(role, next);
    }
    opts.onLoadout?.();
  }

  /** The ★ rung: put this weapon on the field in its evolved form.
   *
   *  Sets the top level underneath because every evolved weapon reads its built
   *  tier damage — but it does NOT touch the partner passive. Going through
   *  world.evolve would have meant granting that passive to satisfy the recipe,
   *  which buys a build effect as a side effect and quietly changes the thing
   *  being measured. See RunWorld.evolveForSandbox. */
  function setWeaponEvolved(role: Role, evolution: EvolutionDefinition): void {
    if (world.evolved.has(role)) return;
    setWeaponTier(role, WEAPON_MAX_LEVEL);
    if (world.evolveForSandbox(role)) engine.setEvolutionGain(role, evolution.gainDb);
    opts.onLoadout?.();
  }

  function setItemLevel(id: ItemId, level: number): void {
    const next = Math.max(0, Math.min(itemMaxLevel(id), Math.floor(level)));
    world.setItemLevelForSandbox(id, next);
    // Dropping a passive no longer un-evolves its partner. That coupling only
    // existed because the panel evolved THROUGH the recipe; now that ★ ignores
    // the recipe, an evolved weapon has no claim on any passive, and pulling a
    // passive out from under it to isolate a variable must not undo it.
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
    const key = `${world.level}/${tuningRevision}`;
    if (key === lastStatsKey) return;
    lastStatsKey = key;
    for (const [kind, node] of enemyStatNodes) {
      // Tuned, not shipped: this row must say what a NEAR press will actually
      // put on the floor, or the catalog and the lab disagree.
      const base = enemyStats(kind, world.level);
      node.textContent =
        `hp ${formatStat(base.hp)} · dmg ${formatStat(base.damage)}` +
        ` · spd ${formatStat(base.speed)} · xp ${formatStat(base.xp)}` +
        (isTuned(kind) ? ' · TUNED' : '');
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
    threatStatus.textContent =
      `minute ${Math.floor(world.timeS / 60)} · MINUTE WAVE reads this row of the 30-minute table`;
    levelStatus.textContent = `level ${world.level} · HP ${Math.ceil(world.player.hp)}/${world.playerMaxHp}`;
    // No separate evolution pass: ★ is a rung of the weapon's own ChoiceButtons
    // and is synced by the loop above with every other rung.
    const mods = world.buildMods;
    buildReadout.textContent =
      `build: move ×${mods.moveMul.toFixed(2)} · damage ×${mods.damageMul.toFixed(2)}` +
      ` · speed ×${mods.projectileSpeedMul.toFixed(2)} · pierce +${mods.extraPierce}` +
      ` · bounce ${mods.bounceCount} · area ×${mods.areaMul.toFixed(2)}` +
      ` · regen ${mods.hpRegenPerSecond.toFixed(1)} HP/s`;
    refreshStats();
    refreshLab();
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
