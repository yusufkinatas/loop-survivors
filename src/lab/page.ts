// The Living Lab: in-game documentation made from the running game's own
// registries, simulation, renderer, and audio trigger path. This is one public
// top-level mount with internal room navigation, so every room shares exactly
// one heavy sandbox context.

import { Graphics } from 'pixi.js';
import type { MusicEngine, ScheduledTrigger } from '../audio/engine';
import { getChart } from '../audio/chartstore';
import { supportedRoles } from '../audio/soundset';
import { ROLE_META, type Kit, type Role } from '../audio/kits';
import { TIER_COUNT, type ChartEvent } from '../audio/charts';
import { SIM_DT } from '../game/timing';
import type { LabBootRoom, LabRoomId } from '../dev';
import {
  ENEMIES,
  ENEMY_LABELS,
  RUN,
  TIER_LINES,
  WEAPONS,
  madForestEnemyStats,
  type EnemyKind,
  type WeaponConf,
} from '../game/config';
import { SLOTS, SLOT_LABEL, slotOf, supportedRoster } from '../game/band';
import { ACTIVE_ENEMY_KINDS, STAGE_EVENTS, STAGE_WAVES } from '../game/madforest';
import { rollOffers } from '../game/picks';
import { mulberry32 } from '../game/rng';
import { PLAYER_FOOT_OFFSET, type Enemy } from '../game/run';
import { EVOLUTION_BY_ROLE, GEARS } from '../game/evolutions';
import { LabSandbox } from './context';

interface RoomDef {
  id: Exclude<LabRoomId, 'hub'>;
  eyebrow: string;
  title: string;
  description: string;
  count: () => string;
}

const ROOMS: readonly RoomDef[] = [
  {
    id: 'movement',
    eyebrow: 'GYM',
    title: 'Movement & Space',
    description: 'Walk the real player and inspect speed, distance, camera size, and spawn clearance.',
    count: () => 'live movement metrics',
  },
  {
    id: 'enemies',
    eyebrow: 'ZOO',
    title: 'Enemy Zoo',
    description: 'Browse every enemy used by the active stage, then spawn its real body and behavior.',
    count: () => `${ACTIVE_ENEMY_KINDS.length} stage enemies`,
  },
  {
    id: 'instruments',
    eyebrow: 'ZOO',
    title: 'Instrument Zoo',
    description: 'Fire one sound-weapon by hand, including its Base IV and Evolved sound states, against live targets.',
    count: () => `${supportedRoles().length} active weapons · base/evolved`,
  },
  {
    id: 'systems',
    eyebrow: 'MUSEUM',
    title: 'Systems Museum',
    description: 'Watch the one-event/two-output rule, contact damage, and band-slot ownership work.',
    count: () => '3 live rules',
  },
] as const;

type Cleanup = () => void;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  parent: HTMLElement,
  text = '',
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  parent.appendChild(node);
  return node;
}

function button(
  parent: HTMLElement,
  text: string,
  action: string,
  onClick: () => void,
  className = 'small',
): HTMLButtonElement {
  const node = el('button', className, parent, text);
  node.dataset.labAction = action;
  node.onclick = () => {
    onClick();
  };
  return node;
}

function metric(parent: HTMLElement, label: string, value = '—'): HTMLElement {
  const row = el('div', 'lab-metric', parent);
  el('span', 'lab-metric-label', row, label);
  return el('span', 'lab-metric-value', row, value);
}

function setPressed(button: HTMLButtonElement, pressed: boolean): void {
  button.classList.toggle('on', pressed);
  button.setAttribute('aria-pressed', String(pressed));
}

function fmt(value: number, digits = 0): string {
  if (!Number.isFinite(value)) return '∞';
  return value.toFixed(digits);
}

function weaponStats(conf: WeaponConf): string {
  const labels: [keyof WeaponConf, string][] = [
    ['damage', 'damage'],
    ['speed', 'speed'],
    ['radius', 'radius'],
    ['lifetimeS', 'life'],
    ['pierce', 'pierce'],
    ['arc', 'arc'],
    ['orbitRadius', 'orbit'],
    ['area', 'area'],
    ['amount', 'amount'],
  ];
  return labels
    .flatMap(([key, label]) => {
      const value = conf[key];
      return value === undefined ? [] : [`${label} ${fmt(value, Number.isInteger(value) ? 0 : 2)}`];
    })
    .join(' · ');
}

export async function mountDocumentationLab(
  root: HTMLElement,
  engine: MusicEngine,
  kits: Map<Role, Kit>,
  initial: LabBootRoom,
): Promise<void> {
  root.classList.add('game-root', 'lab-root');
  const context = await LabSandbox.create(root, engine, kits);
  const vignette = el('div', 'arena-vignette', root);
  const chrome = el('div', 'lab-chrome', root);
  chrome.dataset.labReady = 'true';
  const header = el('header', 'lab-header', chrome);
  const identity = el('div', 'lab-identity', header);
  el('span', 'lab-mark', identity, 'LIVE');
  const headerCopy = el('div', '', identity);
  el('strong', '', headerCopy, 'Living Lab');
  const roomName = el('span', 'lab-current', headerCopy, 'Hub');
  const headerActions = el('div', 'lab-header-actions', header);
  const backBtn = el('button', 'small', headerActions, '← hub');
  backBtn.dataset.labBack = 'true';
  const exitBtn = el('button', 'small', headerActions, 'exit to game');
  exitBtn.dataset.labExit = 'true';
  const content = el('main', 'lab-content', chrome);
  const autoStatus = el('output', 'lab-autodrive-status', chrome, '');
  autoStatus.dataset.labAutodriveState = 'idle';

  let current: LabRoomId = 'hub';
  let roomCleanup: Cleanup[] = [];
  let leaving = false;

  function cleanRoom(): void {
    for (const cleanup of roomCleanup.splice(0)) cleanup();
    context.resetRoom();
    content.replaceChildren();
    content.className = 'lab-content';
  }

  function navigate(room: LabRoomId): void {
    cleanRoom();
    current = room;
    chrome.dataset.labRoom = room;
    root.dataset.labRoom = room;
    backBtn.style.display = room === 'hub' ? 'none' : '';
    roomName.textContent = room === 'hub' ? 'Hub' : ROOMS.find((def) => def.id === room)!.title;
    if (room === 'hub') renderHub();
    else if (room === 'movement') renderMovement();
    else if (room === 'enemies') renderEnemies();
    else if (room === 'instruments') renderInstruments();
    else renderSystems();
    content.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
  }

  async function exitLab(): Promise<void> {
    if (leaving) return;
    leaving = true;
    await context.restoreSnapshot();
    const restored = context.snapshotMatches();
    await context.destroy();
    window.removeEventListener('keydown', onKeyDown);
    vignette.remove();
    chrome.remove();
    const handle = (window as unknown as { loop: Record<string, unknown> }).loop;
    delete handle.lab;
    delete handle.labAutoDrive;
    const url = new URL(location.href);
    url.hash = '';
    if (import.meta.env.VITE_LOOP_LAB_ROOM) url.searchParams.set('lab', 'off');
    else url.searchParams.delete('lab');
    if (!restored) url.searchParams.set('labRestoreFailed', '1');
    location.assign(`${url.pathname}${url.search}`);
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.code !== 'Escape') return;
    event.preventDefault();
    if (current === 'hub') void exitLab();
    else navigate('hub');
  }
  window.addEventListener('keydown', onKeyDown);
  backBtn.onclick = () => navigate('hub');
  exitBtn.onclick = () => void exitLab();

  function panel(eyebrow: string, title: string, description: string): HTMLElement {
    const node = el('section', 'lab-panel', content);
    const head = el('div', 'lab-panel-head', node);
    el('span', 'lab-eyebrow', head, eyebrow);
    const heading = el('h1', '', head, title);
    heading.tabIndex = -1;
    el('p', '', head, description);
    return node;
  }

  function renderHub(): void {
    content.classList.add('lab-hub');
    const hero = el('section', 'lab-hero', content);
    el('span', 'lab-eyebrow', hero, 'DOCUMENTATION THAT RUNS');
    const heading = el('h1', '', hero, 'Gym. Zoo. Museum.');
    heading.tabIndex = -1;
    el(
      'p',
      '',
      hero,
      'These rooms read the game’s real data and borrow its real simulation. If the game changes, the documentation changes with it—or breaks loudly.',
    );
    const badges = el('div', 'lab-badges', hero);
    el('span', '', badges, `${ACTIVE_ENEMY_KINDS.length} enemies from stage data`);
    el('span', '', badges, `${supportedRoles().length} weapons from the soundset`);
    el('span', '', badges, 'one shared live world');

    const grid = el('div', 'lab-room-grid', content);
    for (const def of ROOMS) {
      const card = el('button', 'lab-room-card', grid);
      card.dataset.labRoomTarget = def.id;
      el('span', 'lab-eyebrow', card, def.eyebrow);
      el('strong', '', card, def.title);
      el('p', '', card, def.description);
      el('small', '', card, def.count());
      card.onclick = () => navigate(def.id);
    }
    el('p', 'lab-legend lab-hub-legend', content, 'Choose a room · Esc or “exit to game” leaves the lab');
  }

  function renderMovement(): void {
    const node = panel(
      'GYM · movement',
      'Movement & Space',
      'The white player token, camera, and spawn boundary below are the real run scale—not a diagram rebuilt from memory.',
    );
    const controls = el('div', 'lab-actions', node);
    const resetPosition = (): void => {
      context.world.player.x = 0;
      context.world.player.y = 0;
    };
    button(controls, 'reset to origin', 'movement-reset', resetPosition);
    const measureResult = el('output', 'lab-result', node, 'run both one-second checks');
    measureResult.dataset.labResult = 'movement';
    let eastDistance: number | null = null;
    let diagonalDistance: number | null = null;
    const refreshMeasure = (): void => {
      if (eastDistance === null || diagonalDistance === null) return;
      const delta = Math.abs(eastDistance - diagonalDistance);
      const pass = delta < 0.01;
      measureResult.textContent =
        `east ${fmt(eastDistance, 2)} · diagonal ${fmt(diagonalDistance, 2)} · difference ${fmt(delta, 3)}`;
      measureResult.classList.toggle('pass', pass);
      measureResult.classList.toggle('fail', !pass);
    };
    button(controls, 'measure 1s east', 'movement-east', () => {
      resetPosition();
      context.runWithKeys(['KeyD'], 60);
      eastDistance = Math.hypot(context.world.player.x, context.world.player.y);
      refreshMeasure();
    });
    button(controls, 'measure 1s diagonal', 'movement-diagonal', () => {
      resetPosition();
      context.runWithKeys(['KeyD', 'KeyS'], 60);
      diagonalDistance = Math.hypot(context.world.player.x, context.world.player.y);
      refreshMeasure();
    });
    const metrics = el('div', 'lab-metrics', node);
    const speedEl = metric(metrics, 'actual speed');
    const maxEl = metric(metrics, 'configured max', `${fmt(RUN.playerSpeed, 1)} units/s`);
    const distanceEl = metric(metrics, 'distance from start');
    const axisEl = metric(metrics, 'input vector');
    const cameraEl = metric(metrics, 'visible world');
    const marginEl = metric(metrics, 'spawn clearance', `${ENEMIES.spawnMargin} + body radius`);
    el(
      'p',
      'lab-note',
      node,
      'Spatial invariant: regular enemies are constructed beyond the cyan camera box. The violet box marks the earliest edge before adding each enemy’s own radius.',
    );
    el('p', 'lab-legend', node, 'Move: WASD / arrows / touch stick · Esc or ← hub: back');

    const drawing = new Graphics();
    const inset = new Graphics();
    context.overlay.addChild(drawing);
    context.overlay.addChild(inset);
    const cameraLabel = context.worldLabel('SPATIAL INSET\ncyan = view · violet = earliest spawn edge', 0xffffff);
    const originLabel = context.worldLabel('START\n0, 0', 0xffffff);
    originLabel.position.set(0, -18);
    context.setFrame(() => {
      const world = context.world;
      const p = world.player;
      const actualSpeed = Math.hypot(context.movementAxis.x, context.movementAxis.y) * RUN.playerSpeed;
      speedEl.textContent = `${fmt(actualSpeed, 1)} units/s`;
      distanceEl.textContent = `${fmt(Math.hypot(p.x, p.y), 1)} units`;
      axisEl.textContent = `${context.movementAxis.x.toFixed(2)}, ${context.movementAxis.y.toFixed(2)}`;
      cameraEl.textContent = `${fmt(world.worldW)} × ${fmt(world.worldH)}`;
      maxEl.classList.toggle('ok', actualSpeed <= RUN.playerSpeed * 1.03);
      marginEl.classList.add('ok');

      const cx = p.x + PLAYER_FOOT_OFFSET.x;
      const cy = p.y + PLAYER_FOOT_OFFSET.y;
      const w = world.worldW;
      const h = world.worldH;
      const m = ENEMIES.spawnMargin;
      drawing
        .clear()
        .rect(cx - w / 2, cy - h / 2, w, h)
        .stroke({ width: 3, color: 0x59ffd1, alpha: 0.78 })
        .rect(cx - w / 2 - m, cy - h / 2 - m, w + m * 2, h + m * 2)
        .stroke({ width: 3, color: 0xc8a7ff, alpha: 0.62 })
        .moveTo(0, 0)
        .lineTo(p.x, p.y)
        .stroke({ width: 2, color: 0xffffff, alpha: 0.35 })
        .circle(0, 0, 7)
        .fill({ color: 0xffffff, alpha: 0.75 });
      const outerW = 250;
      const outerH = outerW * ((h + m * 2) / (w + m * 2));
      const innerW = outerW * (w / (w + m * 2));
      const innerH = outerH * (h / (h + m * 2));
      const ix = cx + w / 2 - outerW - 45;
      const iy = cy - h / 2 + 105;
      inset
        .clear()
        .roundRect(ix, iy, outerW, outerH, 10)
        .fill({ color: 0x10151f, alpha: 0.72 })
        .stroke({ width: 3, color: 0xc8a7ff, alpha: 0.9 })
        .rect(ix + (outerW - innerW) / 2, iy + (outerH - innerH) / 2, innerW, innerH)
        .stroke({ width: 3, color: 0x59ffd1, alpha: 0.95 });
      cameraLabel.position.set(ix + outerW / 2, iy - 10);
    });
  }

  function renderEnemies(): void {
    const node = panel(
      'ZOO · active stage registry',
      'Enemy Zoo',
      'The roster is generated from the real wave and event tables. Add an enemy to the stage data and a new row appears here automatically.',
    );
    let selected: EnemyKind = ACTIVE_ENEMY_KINDS[0];
    const roster = el('div', 'lab-roster lab-enemy-roster', node);
    const detail = el('div', 'lab-detail', node);
    const detailName = el('strong', '', detail);
    const detailId = el('code', '', detail);
    const detailStats = el('p', '', detail);
    const detailFlags = el('p', 'lab-note', detail);
    const levelRow = el('div', 'lab-actions compact', node);
    el('span', 'lab-action-label', levelRow, 'player level');
    const levelButtons: HTMLButtonElement[] = [];
    const spawnRow = el('div', 'lab-actions', node);
    const pauseBtn = button(spawnRow, 'pause motion', 'enemy-pause', () => {
      context.setPaused(!context.isPaused);
      pauseBtn.textContent = context.isPaused ? 'resume motion' : 'pause motion';
      setPressed(pauseBtn, context.isPaused);
    });
    setPressed(pauseBtn, false);
    button(spawnRow, 'spawn one', 'enemy-spawn-one', () => spawnSelected(1));
    button(spawnRow, 'spawn 8', 'enemy-spawn-eight', () => spawnSelected(8));
    button(spawnRow, 'ring', 'enemy-ring', () => spawnSelected(16));
    button(spawnRow, 'show real deaths', 'enemy-kill', () => context.world.killVisible());
    button(spawnRow, 'clear', 'enemy-clear', () => context.world.clearSandboxEntities());
    el('p', 'lab-legend', node, 'Pick a registry row, then spawn it · labels follow live bodies · Esc or ← hub: back');

    const rosterButtons = new Map<EnemyKind, HTMLButtonElement>();
    for (const kind of ACTIVE_ENEMY_KINDS) {
      const entry = el('button', 'lab-roster-item', roster);
      entry.dataset.enemyKind = kind;
      el('span', '', entry, ENEMY_LABELS[kind] ?? kind);
      el('code', '', entry, kind);
      entry.onclick = () => {
        selected = kind;
        refreshSelection();
      };
      rosterButtons.set(kind, entry);
    }
    for (const level of [1, 5, 10, 20, 40]) {
      const levelBtn = el('button', 'small', levelRow, String(level));
      levelBtn.dataset.labLevel = String(level);
      levelBtn.onclick = () => {
        context.world.level = level;
        levelButtons.forEach((candidate) => setPressed(candidate, candidate === levelBtn));
        refreshSelection();
      };
      levelButtons.push(levelBtn);
    }
    levelButtons.forEach((candidate, index) => setPressed(candidate, index === 0));

    function refreshSelection(): void {
      const conf = ENEMIES[selected];
      const stats = madForestEnemyStats(selected, context.world.level);
      detailName.textContent = ENEMY_LABELS[selected] ?? selected;
      detailId.textContent = selected;
      detailStats.textContent =
        `hp ${fmt(stats.hp, 1)} · damage ${fmt(stats.damage, 1)} · speed ${fmt(stats.speed, 1)}` +
        ` · xp ${fmt(stats.xp, 1)} · radius ${fmt(stats.radius, 1)}` +
        ` · knockback received ×${fmt(stats.knockback, 1)}`;
      const flags = [
        conf.boss ? 'elite / boss body' : 'regular body',
        conf.hpPerLevel ? 'health multiplies by player level' : 'fixed health',
        conf.fixedDirection ? 'crosses in one locked direction' : 'pursues the player',
      ];
      detailFlags.textContent = flags.join(' · ');
      for (const [kind, entry] of rosterButtons) setPressed(entry, kind === selected);
    }

    function spawnSelected(count: number): void {
      const p = context.world.player;
      const radius = count === 1 ? 230 : 220;
      const centerX = count === 1 ? p.x : p.x + 120;
      for (let i = 0; i < count; i++) {
        const angle = count === 1 ? 0 : (i / count) * Math.PI * 2;
        context.spawnEnemy(selected, centerX + Math.cos(angle) * radius, p.y + Math.sin(angle) * radius);
      }
    }

    const labels = new Map<Enemy, ReturnType<LabSandbox['worldLabel']>>();
    context.setFrame(() => {
      const alive = new Set(context.world.enemies);
      for (const enemy of context.world.enemies) {
        let label = labels.get(enemy);
        if (!label) {
          label = context.worldLabel('', enemy.color);
          labels.set(enemy, label);
        }
        label.text = `${enemy.kind} #${enemy.id}\nhp ${fmt(Math.max(0, enemy.hp), 1)} · dmg ${fmt(enemy.damage, 1)}`;
        label.position.set(enemy.x, enemy.y - enemy.radius - 8);
      }
      for (const [enemy, label] of labels) {
        if (alive.has(enemy)) continue;
        label.destroy();
        labels.delete(enemy);
      }
    });
    roomCleanup.push(() => {
      for (const label of labels.values()) label.destroy();
      labels.clear();
    });
    refreshSelection();
    spawnSelected(1);
  }

  function renderInstruments(): void {
    const node = panel(
      'ZOO · sound + weapon',
      'Instrument Zoo',
      '“Pulse once” sends a real sound event through the engine. The suite listener routes that same event into the real weapon code: one event, two outputs.',
    );
    context.setPaused(true);
    const roles = supportedRoles();
    let selected = roles[0];
    let tier = 1;
    let variant = ROLE_META[selected].variants[0];
    let evolved = false;
    let patternOn = false;
    const roster = el('div', 'lab-roster lab-instrument-roster', node);
    const detail = el('div', 'lab-detail', node);
    const detailName = el('strong', '', detail);
    const detailId = el('code', '', detail);
    const detailStats = el('p', '', detail);
    const detailLine = el('p', 'lab-note', detail);
    const tierRow = el('div', 'lab-actions compact', node);
    el('span', 'lab-action-label', tierRow, 'tier');
    const tierButtons: HTMLButtonElement[] = [];
    const evolutionRow = el('div', 'lab-actions compact', node);
    el('span', 'lab-action-label', evolutionRow, 'sound state');
    const baseBtn = el('button', 'small', evolutionRow, 'Base IV');
    baseBtn.dataset.labEvolution = 'base';
    const evolvedBtn = el('button', 'small', evolutionRow, 'Evolved');
    evolvedBtn.dataset.labEvolution = 'evolved';
    const variantRow = el('div', 'lab-actions compact', node);
    el('span', 'lab-action-label', variantRow, 'sound variant');
    const variantButtons = el('div', 'lab-inline-buttons', variantRow);
    const actions = el('div', 'lab-actions', node);
    const pulseBtn = button(actions, 'pulse once', 'instrument-pulse', () => pulse());
    const patternBtn = button(actions, 'play real pattern', 'instrument-pattern', () => {
      patternOn = !patternOn;
      context.setPaused(!patternOn);
      context.setPatternPlaying(patternOn);
      patternBtn.textContent = patternOn ? 'stop real pattern' : 'play real pattern';
      setPressed(patternBtn, patternOn);
    });
    setPressed(patternBtn, false);
    button(actions, 'reset targets', 'instrument-targets', () => seedTargets());
    const fixtureBtn = button(actions, 'run evolved combat fixture', 'instrument-evolution-fixture', () => runEvolutionFixture());
    const fixtureResult = el('output', 'lab-result', node, 'evolved fixture ready');
    fixtureResult.dataset.labResult = 'evolution-combat';
    const live = el('div', 'lab-live-readout', node, '0 trigger events received');
    el('p', 'lab-legend', node, 'Choose an instrument, tier, and variant · pulse is manual and immediate · Esc or ← hub: back');

    const roleButtons = new Map<Role, HTMLButtonElement>();
    for (const role of roles) {
      const entry = el('button', 'lab-roster-item', roster);
      entry.dataset.role = role;
      entry.style.setProperty('--voice-color', ROLE_META[role].color);
      el('span', '', entry, ROLE_META[role].name);
      el('code', '', entry, `${role} · ${SLOT_LABEL[slotOf(role)]}`);
      entry.onclick = () => {
        selected = role;
        variant = ROLE_META[role].variants[0];
        evolved = false;
        stopPattern();
        refreshSelection();
        seedTargets();
      };
      roleButtons.set(role, entry);
    }
    for (let n = 1; n <= TIER_COUNT; n++) {
      const tierBtn = el('button', 'small', tierRow, String(n));
      tierBtn.dataset.labTier = String(n);
      tierBtn.onclick = () => {
        tier = n;
        evolved = false;
        tierButtons.forEach((candidate) => setPressed(candidate, candidate === tierBtn));
        refreshSelection();
        seedTargets();
      };
      tierButtons.push(tierBtn);
    }
    tierButtons.forEach((candidate, index) => setPressed(candidate, index === 0));
    baseBtn.onclick = () => setEvolution(false);
    evolvedBtn.onclick = () => setEvolution(true);

    function setEvolution(on: boolean): void {
      evolved = on;
      tier = 4;
      tierButtons.forEach((candidate, index) => setPressed(candidate, index === 3));
      refreshSelection();
      seedTargets();
    }

    function stopPattern(): void {
      patternOn = false;
      context.setPaused(true);
      context.setPatternPlaying(false);
      patternBtn.textContent = 'play real pattern';
      setPressed(patternBtn, false);
    }

    function refreshSelection(): void {
      stopPattern();
      const meta = ROLE_META[selected];
      const conf = WEAPONS[selected]![tier - 1];
      const chart = getChart(selected, tier);
      const evolution = EVOLUTION_BY_ROLE.get(selected);
      const gear = evolution ? GEARS[evolution.gear] : undefined;
      detailName.textContent = evolved && evolution
        ? `${meta.name} → ${evolution.name}`
        : `${meta.name} · tier ${tier}`;
      detailId.textContent = evolved && gear
        ? `${selected} / slot:${slotOf(selected)} / paired Gear:${gear.name}`
        : `${selected} / slot:${slotOf(selected)}`;
      detailStats.textContent =
        `${weaponStats(conf)} · ${chart.events.length} scheduled sound event${chart.events.length === 1 ? '' : 's'}` +
        ` in a ${chart.bars * 4}-beat loop`;
      detailLine.textContent = evolved && evolution
        ? `${evolution.fantasy} The chart and trigger count stay identical to Base IV.`
        : TIER_LINES[selected]?.[tier - 1] ?? 'Live tier from the gameplay registry.';
      for (const [role, entry] of roleButtons) setPressed(entry, role === selected);
      baseBtn.disabled = !evolution;
      evolvedBtn.disabled = !evolution;
      setPressed(baseBtn, tier === 4 && !evolved);
      setPressed(evolvedBtn, tier === 4 && evolved);
      variantButtons.replaceChildren();
      for (const name of meta.variants) {
        const variantBtn = el('button', 'small', variantButtons, name);
        variantBtn.dataset.labVariant = name;
        setPressed(variantBtn, name === variant);
        variantBtn.onclick = () => {
          variant = name;
          refreshSelection();
        };
      }
      context.selectInstrument(selected, tier, evolved);
      pulseBtn.style.setProperty('--voice-color', meta.color);
      fixtureBtn.disabled = !evolution;
    }

    function pulseEvent(): ChartEvent {
      const chart = getChart(selected, tier);
      const source =
        chart.events.find((event) => event.variant === variant) ??
        chart.events[0] ??
        { step: 0, velocity: 0.9 };
      return {
        ...source,
        step: 0,
        variant,
        note: ROLE_META[selected].pitched ? (source.note ?? 0) : undefined,
      };
    }

    function pulse(): void {
      context.pulse(selected, pulseEvent());
      // Manual inspection stays frozen between presses. Advance the real world
      // long enough for traveling shots/zones to resolve, then freeze again.
      context.runSteps(90);
      refreshLive();
      live.classList.add('flash');
      window.setTimeout(() => live.classList.remove('flash'), 180);
    }

    function seedTargets(): void {
      stopPattern();
      context.world.clearSandboxEntities();
      context.selectInstrument(selected, tier, evolved);
      const p = context.world.player;
      const positions = [
        [105, 0], [230, -180], [430, -190], [260, -60],
        [480, 0], [250, 100], [440, 170], [80, 230],
      ] as const;
      for (const [x, y] of positions) context.spawnEnemy('flower', p.x + x, p.y + y);
    }

    function runEvolutionFixture(): void {
      stopPattern();
      evolved = true;
      tier = 4;
      refreshSelection();
      context.world.clearSandboxEntities();
      context.selectInstrument(selected, 4, true);
      const w = context.world;
      w.player.x = 0;
      w.player.y = 0;
      w.player.facingX = 1;
      const target = (x: number, y: number, hp = 1000): Enemy => {
        const spawned = context.spawnEnemy('skeleton', x, y);
        if (!spawned) throw new Error(`instrument fixture could not spawn ${selected} target`);
        spawned.speed = 0;
        spawned.hp = hp;
        return spawned;
      };
      const send = (event: ChartEvent): void => context.pulse(selected, event);
      let pass = false;
      let observation = '';

      switch (selected) {
        case 'kick': {
          for (const [index, step] of [0, 4, 8, 12].entries()) {
            w.player.x = index * 80;
            target(w.player.x + 100, 0);
            send({ step, velocity: 1 });
          }
          context.runSteps(15);
          const stamps = w.fx?.filter((effect) => effect.type === 'stamp').length ?? 0;
          pass = stamps === 4;
          observation = `${stamps} stored-position echoes on beat 4`;
          break;
        }
        case 'snare': {
          const front = target(100, 0, 40);
          const middle = target(220, 0, 80);
          const elite = target(430, 0, 1000);
          send({ step: 4, velocity: 1 });
          pass = front.hp < 40 && middle.hp < 80 && elite.hp < 1000 && elite.hp < 1000 - 13 * 1.25;
          observation = `line hits ${fmt(40 - front.hp, 1)} / ${fmt(80 - middle.hp, 1)} · target ${fmt(1000 - elite.hp, 1)}`;
          break;
        }
        case 'hat': {
          const marked = target(20, 0);
          for (let i = 0; i < 4; i++) {
            send({ step: i, velocity: 1, variant: 'closed' });
            context.runSteps(8);
          }
          const stored = marked.hatCuts;
          send({ step: 4, velocity: 1, variant: 'open' });
          context.runSteps(8);
          pass = stored === 4 && marked.hatCuts === 0;
          observation = `${stored} Cuts stored · open hit leaves ${marked.hatCuts}`;
          break;
        }
        case 'arp': {
          send({ step: 0, velocity: 1, note: 0 });
          send({ step: 4, velocity: 1, note: 10 });
          send({ step: 8, velocity: 1, note: 3 });
          context.runSteps(10);
          const rings = new Set(w.projectiles.filter((shot) => shot.role === 'arp').map((shot) => shot.orbitRing));
          pass = rings.has(-1) && rings.has(1);
          observation = `${w.projectiles.length} orbiters · inner/outer counter-rotate`;
          break;
        }
        case 'bass': {
          target(24, 0);
          send({ step: 31, velocity: 1 });
          context.runSteps(3);
          pass = w.undertowWalls.length === 1 && w.enemies.some((enemy) => enemy.wallCarryT > 0);
          observation = `${w.undertowWalls.length} phrase-end wall · carried target ${pass ? 'yes' : 'no'}`;
          break;
        }
        case 'chord': {
          target(80, 0);
          send({ step: 0, velocity: 0.8, variant: 'stab' });
          send({ step: 48, velocity: 1, variant: 'pad' });
          context.runSteps(1);
          pass = w.zones.length === 6 && new Set(w.zones.map((zone) => zone.groupId)).size === 2;
          observation = `${w.zones.length} circles from short + held events · overlap slow ${fmt(w.enemies[0]?.slowMul ?? 1, 2)}×`;
          break;
        }
        case 'lead': {
          target(70, 0);
          target(120, 0);
          target(170, 0);
          send({ step: 0, velocity: 1, note: 0 });
          context.runSteps(8);
          send({ step: 4, velocity: 1, note: 3 });
          context.runSteps(8);
          const beforeReset = w.headliner?.visited.size ?? 0;
          send({ step: 0, velocity: 1, note: 5 });
          context.runSteps(8);
          const afterReset = w.headliner?.visited.size ?? 0;
          pass = beforeReset === 2 && afterReset === 1;
          observation = `${beforeReset} fresh targets · phrase reset → ${afterReset}`;
          break;
        }
        case 'clap': {
          const caught = target(70, 0);
          const before = caught.hp;
          send({ step: 4, velocity: 1 });
          context.runSteps(10);
          const wasCaught = w.standingOvations[0]?.caught.has(caught) === true;
          context.runSteps(4);
          const released = w.standingOvations[0]?.released === true;
          pass = wasCaught && released && caught.hp < before;
          observation = `caught once ${wasCaught ? 'yes' : 'no'} · released without second hit ${released ? 'yes' : 'no'}`;
          break;
        }
        case 'bell': {
          for (let i = 0; i < 9; i++) target(180 + (i % 3) * 18, (Math.floor(i / 3) - 1) * 18);
          send({ step: 4, velocity: 1, note: 0 });
          for (let i = 0; i < 45 && !w.projectiles.some((shot) => shot.shard); i++) context.runSteps(1);
          const shards = w.projectiles.filter((shot) => shot.shard);
          const assigned = shards.map((shot) => shot.assignedTargetId).filter((id): id is number => id !== null);
          pass = shards.length === 8 && new Set(assigned).size === assigned.length;
          observation = `${shards.length} shards · ${new Set(assigned).size} unique assignments`;
          break;
        }
      }

      fixtureResult.textContent = `${pass ? 'PASS' : 'FAIL'} · ${EVOLUTION_BY_ROLE.get(selected)?.name ?? selected} · ${observation}`;
      fixtureResult.classList.toggle('pass', pass);
      fixtureResult.classList.toggle('fail', !pass);
      fixtureResult.dataset.labEvolutionRole = selected;
      fixtureResult.dataset.labEvolutionState = pass ? 'passed' : 'failed';
    }

    const labels = new Map<Enemy, ReturnType<LabSandbox['worldLabel']>>();
    const receivedByRole = new Map<Role, number>();
    const refreshLive = (): void => {
      const received = receivedByRole.get(selected) ?? 0;
      const damage = context.world.damageByRole[selected] ?? 0;
      live.textContent =
        `${received} trigger event${received === 1 ? '' : 's'} received` +
        ` · ${fmt(damage, 1)} effective damage so far`;
    };
    const stopWatching = context.watchTriggers((trigger: ScheduledTrigger) => {
      receivedByRole.set(trigger.role, (receivedByRole.get(trigger.role) ?? 0) + 1);
      refreshLive();
    });
    context.setFrame(() => {
      const alive = new Set(context.world.enemies);
      for (const enemy of context.world.enemies) {
        let label = labels.get(enemy);
        if (!label) {
          label = context.worldLabel('', 0x9fe8b2);
          labels.set(enemy, label);
        }
        label.text = `target #${enemy.id}\nhp ${fmt(Math.max(0, enemy.hp), 1)}`;
        label.position.set(enemy.x, enemy.y - enemy.radius - 6);
      }
      for (const [enemy, label] of labels) {
        if (alive.has(enemy)) continue;
        label.destroy();
        labels.delete(enemy);
      }
      refreshLive();
    });
    roomCleanup.push(() => {
      stopWatching();
      for (const label of labels.values()) label.destroy();
      labels.clear();
    });
    refreshSelection();
    seedTargets();
    pulseBtn.style.setProperty('--voice-color', ROLE_META[selected].color);
  }

  function renderSystems(): void {
    const node = panel(
      'MUSEUM · rules in motion',
      'Systems Museum',
      'Each exhibit calls the production system it describes. The numbers below are observations from the current live objects, not copied prose.',
    );
    context.setPaused(true);

    const onsetCard = el('section', 'lab-exhibit', node);
    el('h2', '', onsetCard, '1. One scheduled event → sound + weapon');
    el('p', '', onsetCard, 'A manual Kick event enters the audio engine, then the same due event creates the real forward damage strip.');
    const onsetResult = el('output', 'lab-result', onsetCard, 'ready');
    button(onsetCard, 'fire one event', 'system-onset', () => {
      context.world.clearSandboxEntities();
      context.selectInstrument('kick', 1);
      context.world.player.facingX = 1;
      const target = context.spawnEnemy('greenMudman', 105, 0);
      const before = target?.hp ?? 0;
      const event = getChart('kick', 1).events[0] ?? { step: 0, velocity: 0.9 };
      const beforeTriggers = context.triggerCount;
      context.pulse('kick', { ...event, step: 0 });
      context.runSteps(15);
      const dealt = before - (target?.hp ?? before);
      const eventCount = context.triggerCount - beforeTriggers;
      const hasKickVfx = context.world.fx?.some((effect) => effect.type === 'whip') === true;
      onsetResult.textContent =
        `${eventCount} engine event · ${fmt(dealt, 1)} target damage · ` +
        (hasKickVfx ? 'real Kick VFX' : 'Kick VFX missing');
      const pass = eventCount === 1 && dealt > 0 && hasKickVfx;
      onsetResult.classList.toggle('pass', pass);
      onsetResult.classList.toggle('fail', !pass);
    });

    const contactCard = el('section', 'lab-exhibit', node);
    const batStats = madForestEnemyStats('bat', 1);
    const batPower = ENEMIES.bat.power ?? batStats.damage + RUN.playerArmor;
    el('h2', '', contactCard, `2. Contact damage and the ${fmt(RUN.iframesS * 1000)} ms lock`);
    el(
      'p',
      '',
      contactCard,
      `A small bat has attack strength (Power) ${fmt(batPower)}. The player’s armor ${fmt(RUN.playerArmor)}` +
        ` reduces the live hit to ${fmt(batStats.damage)}, then brief invulnerability blocks immediate repeats.`,
    );
    const contactResult = el('output', 'lab-result', contactCard, 'ready');
    contactResult.dataset.labResult = 'contact';
    button(contactCard, 'apply one real contact', 'system-contact', () => {
      context.world.clearSandboxEntities();
      context.world.player.hp = RUN.playerHp;
      context.world.player.iframesT = 0;
      context.world.invincible = false;
      const p = context.world.player;
      // spawnEnemyAt consumes the source-feet position. Equal feet puts the
      // frame-derived circle over the player without reconstructing offsets.
      const attacker = context.spawnEnemy('bat', p.x, p.y);
      const before = p.hp;
      context.runSteps(1);
      const first = before - p.hp;
      const afterFirst = p.hp;
      const repeatSteps = 5;
      // Keep the same attacker overlapping after solid-circle resolution
      // pushes it away. The second zero therefore proves the invulnerability
      // window, rather than merely proving that the bodies separated.
      for (let i = 0; i < repeatSteps; i++) {
        if (attacker) {
          attacker.x = p.x;
          attacker.y = p.y;
        }
        context.runSteps(1);
      }
      const repeat = afterFirst - p.hp;
      context.world.invincible = true;
      contactResult.textContent =
        `first hit ${fmt(first)} hp · repeat inside ${fmt(repeatSteps * SIM_DT * 1000)} ms ${fmt(repeat)} hp` +
        ` · lock ${fmt(RUN.iframesS * 1000)} ms`;
      const pass = first === attacker?.damage && repeat === 0;
      contactResult.classList.toggle('pass', pass);
      contactResult.classList.toggle('fail', !pass);
    });

    const slotCard = el('section', 'lab-exhibit', node);
    el('h2', '', slotCard, '3. One owner per band position');
    el('p', '', slotCard, 'Hiring one instrument permanently removes its same-position rival from fresh level-up offers. Tier-ups for the owner remain allowed.');
    const slotList = el('div', 'lab-slot-list', slotCard);
    for (const slot of SLOTS) {
      const row = el('div', 'lab-slot-row', slotList);
      el('span', '', row, `${SLOT_LABEL[slot]} / ${slot}`);
      el('code', '', row, supportedRoster(slot).join(' · '));
    }
    const slotResult = el('output', 'lab-result', slotCard, 'ready');
    slotResult.dataset.labResult = 'slot';
    button(slotCard, 'test the first rivalry', 'system-slot', () => {
      const slot = SLOTS.find((candidate) => supportedRoster(candidate).length > 1)!;
      const [owner, rival] = supportedRoster(slot);
      const tiers = new Map<Role, number>([[owner, 1]]);
      const rng = mulberry32(73013);
      let rivalOffers = 0;
      let ownerTierUps = 0;
      for (let i = 0; i < 128; i++) {
        for (const offer of rollOffers(tiers, new Set(), rng, 180)) {
          if (offer.kind !== 'weapon') continue;
          if (offer.role === rival) rivalOffers++;
          if (offer.role === owner && offer.tier === 2) ownerTierUps++;
        }
      }
      const pass = rivalOffers === 0 && ownerTierUps > 0;
      slotResult.textContent =
        `${SLOT_LABEL[slot]}: hired ${owner} · ${rival} fresh offers ${rivalOffers}` +
        ` · ${owner} tier-up offers ${ownerTierUps}`;
      slotResult.classList.toggle('pass', pass);
      slotResult.classList.toggle('fail', !pass);
    });

    const reference = el('details', 'lab-reference', node);
    const summary = el('summary', '', reference, 'stage-data reference');
    summary.title = 'Generated from STAGE_WAVES and STAGE_EVENTS';
    const refBody = el('div', 'lab-reference-body', reference);
    for (const wave of STAGE_WAVES) {
      el(
        'code',
        '',
        refBody,
        `${Math.floor(wave.atS / 60)}:00 · wave [${wave.pattern.join(', ')}] · floor ${wave.minimum} · every ${wave.intervalS}s`,
      );
    }
    el('code', '', refBody, `${STAGE_EVENTS.length} timed event rows · every row carries its enemy kind`);
    el('p', 'lab-legend', node, 'Run each exhibit on demand · results come from live state · Esc or ← hub: back');

    const board = new Graphics();
    context.overlay.addChild(board);
    board
      .roundRect(-90, -330, 570, 175, 16)
      .fill({ color: 0x10151f, alpha: 0.42 })
      .stroke({ width: 2, color: 0x59ffd1, alpha: 0.7 })
      .roundRect(-90, -95, 570, 175, 16)
      .fill({ color: 0x10151f, alpha: 0.42 })
      .stroke({ width: 2, color: 0xff6f91, alpha: 0.7 })
      .roundRect(-90, 140, 570, 175, 16)
      .fill({ color: 0x10151f, alpha: 0.42 })
      .stroke({ width: 2, color: 0xc8a7ff, alpha: 0.7 });
    const one = context.worldLabel('ONE EVENT\nheard + played', 0x59ffd1);
    one.position.set(195, -245);
    const two = context.worldLabel('CONTACT\nPower − armor', 0xff6f91);
    two.position.set(195, -10);
    const three = context.worldLabel('BAND POSITION\none permanent owner', 0xc8a7ff);
    three.position.set(195, 225);
  }

  async function runAutoDrive(): Promise<void> {
    const originalError = console.error;
    const failures: string[] = [];
    const onError = (event: ErrorEvent): void => {
      failures.push(event.error instanceof Error ? event.error.message : event.message);
    };
    const onRejection = (event: PromiseRejectionEvent): void => {
      failures.push(event.reason instanceof Error ? event.reason.message : String(event.reason));
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    console.error = (...args: unknown[]) => {
      failures.push(args.map(String).join(' '));
      originalError(...args);
    };
    const wait = (ms = 30): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, ms));
    const assert = (condition: unknown, message: string): void => {
      if (!condition) throw new Error(message);
    };

    autoStatus.dataset.labAutodriveState = 'running';
    autoStatus.textContent = 'AUTO-DRIVE RUNNING';
    root.dataset.labAutodrive = 'running';
    try {
      for (const def of ROOMS) {
        navigate('hub');
        const card = content.querySelector<HTMLButtonElement>(`[data-lab-room-target="${def.id}"]`);
        assert(card, `hub missing ${def.id}`);
        card!.click();
        await wait();
        assert(current === def.id, `${def.id} did not open`);

        if (def.id === 'enemies') {
          const roster = [...content.querySelectorAll<HTMLButtonElement>('[data-enemy-kind]')];
          const ids = roster.map((entry) => entry.dataset.enemyKind);
          assert(
            JSON.stringify(ids) === JSON.stringify(ACTIVE_ENEMY_KINDS),
            'enemy roster drift',
          );
          const spawnOne = content.querySelector<HTMLButtonElement>('[data-lab-action="enemy-spawn-one"]')!;
          const clear = content.querySelector<HTMLButtonElement>('[data-lab-action="enemy-clear"]')!;
          const levelButtons = [...content.querySelectorAll<HTMLButtonElement>('[data-lab-level]')];
          for (const levelButton of levelButtons) levelButton.click();
          levelButtons[0]?.click();
          for (const entry of roster) {
            clear.click();
            entry.click();
            spawnOne.click();
            assert(
              context.world.enemies.length === 1 &&
                context.world.enemies[0].kind === entry.dataset.enemyKind,
              `enemy spawn mismatch for ${entry.dataset.enemyKind}`,
            );
          }
          clear.click();
        }
        if (def.id === 'instruments') {
          const roles = supportedRoles();
          const roster = [...content.querySelectorAll<HTMLButtonElement>('[data-role]')];
          const ids = roster.map((entry) => entry.dataset.role);
          assert(
            JSON.stringify(ids) === JSON.stringify(roles),
            'instrument roster drift',
          );
          assert(!content.querySelector('[data-role="crash"], [data-role="riser"]'), 'retired FX leaked');
          const pulse = content.querySelector<HTMLButtonElement>('[data-lab-action="instrument-pulse"]')!;
          const combatFixture = content.querySelector<HTMLButtonElement>('[data-lab-action="instrument-evolution-fixture"]')!;
          const base = content.querySelector<HTMLButtonElement>('[data-lab-evolution="base"]')!;
          const evolvedButton = content.querySelector<HTMLButtonElement>('[data-lab-evolution="evolved"]')!;
          for (const entry of roster) {
            entry.click();
            const role = entry.dataset.role as Role;
            const evolution = EVOLUTION_BY_ROLE.get(role);
            assert(evolution, `missing evolution registry entry for ${role}`);
            const tiers = [...content.querySelectorAll<HTMLButtonElement>('[data-lab-tier]')];
            assert(
              JSON.stringify(tiers.map((tierButton) => tierButton.dataset.labTier)) ===
                JSON.stringify(['1', '2', '3', '4']),
              `tier controls drift for ${role}`,
            );
            for (const tierButton of tiers) tierButton.click();
            for (const [mode, on, modeButton] of [
              ['base', false, base],
              ['evolved', true, evolvedButton],
            ] as const) {
              modeButton.click();
              assert(context.world.evolved.has(role) === on, `${role} ${mode} world-state mismatch`);
              assert(
                !on || context.world.gear.has(evolution!.gear),
                `${role} ${mode} missing paired Gear`,
              );
              for (const variant of ROLE_META[role].variants) {
                const variantButton = [...content.querySelectorAll<HTMLButtonElement>('[data-lab-variant]')]
                  .find((candidate) => candidate.dataset.labVariant === variant);
                assert(variantButton, `missing ${role} variant ${variant}`);
                variantButton!.click();
                const before = context.triggerCount;
                pulse.click();
                assert(context.triggerCount === before + 1, `${role}/${variant}/${mode} pulse mismatch`);
                assert(context.lastTrigger?.role === role, `${role}/${variant}/${mode} routed wrong role`);
                assert(context.lastTrigger?.evolved === on, `${role}/${variant}/${mode} snapshot mismatch`);
              }
              if (on) {
                combatFixture.click();
                const result = content.querySelector<HTMLOutputElement>('[data-lab-result="evolution-combat"]')!;
                assert(result.dataset.labEvolutionRole === role, `${role} combat fixture routed wrong role`);
                assert(result.dataset.labEvolutionState === 'passed', `${role} evolved combat fixture failed: ${result.textContent}`);
              }
            }
          }
        }

        for (const action of content.querySelectorAll<HTMLButtonElement>('[data-lab-action]')) {
          action.click();
          await wait(12);
          if (failures.length > 0) throw new Error(failures.join(' | '));
        }
        if (def.id === 'enemies') assert(context.world.enemies.length === 0, 'enemy clear failed');
        if (def.id === 'movement') {
          assert(content.querySelector('[data-lab-result="movement"]')?.classList.contains('pass'), 'movement normalization failed');
        }
        if (def.id === 'instruments') assert(context.triggerCount > 0, 'manual instrument pulse failed');
        if (def.id === 'systems') {
          const systemPasses = content.querySelectorAll('.lab-result.pass').length;
          assert(systemPasses >= 3, 'one or more museum exhibits failed');
          assert(content.querySelector('[data-lab-result="slot"]')?.classList.contains('pass'), 'slot rule failed');
        }
      }
      navigate('hub');
      await context.restoreSnapshot();
      assert(context.snapshotMatches(), 'shared-state snapshot/restore mismatch');
      root.dataset.labAutodrive = 'passed';
      autoStatus.dataset.labAutodriveState = 'passed';
      autoStatus.textContent = `PASS · ${ROOMS.length} rooms · globals restored`;
      context.setPaused(true);
      (window as unknown as { loop: Record<string, unknown> }).loop.labAutoDrive = {
        status: 'passed',
        rooms: ROOMS.map((room) => room.id),
        engineRestored: true,
      };
    } catch (error) {
      const message = error instanceof Error ? error.stack ?? error.message : String(error);
      root.dataset.labAutodrive = 'failed';
      autoStatus.dataset.labAutodriveState = 'failed';
      autoStatus.textContent = `FAIL · ${message}`;
      originalError(error);
      (window as unknown as { loop: Record<string, unknown> }).loop.labAutoDrive = {
        status: 'failed',
        error: message,
      };
    } finally {
      console.error = originalError;
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    }
  }

  Object.assign((window as unknown as { loop: Record<string, unknown> }).loop, {
    lab: {
      context,
      get room() {
        return current;
      },
      navigate,
      exit: exitLab,
      rooms: ROOMS.map((room) => room.id),
    },
  });

  navigate(initial === 'auto' ? 'hub' : initial);
  if (initial === 'auto') window.setTimeout(() => void runAutoDrive(), 0);
}
