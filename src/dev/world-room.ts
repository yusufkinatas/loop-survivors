import { Application, Graphics } from 'pixi.js';
import { ROLE_META, ROLES, type Role } from '../audio/kits';
import { SOUNDSET } from '../audio/soundset';
import { SIM_DT, VirtualConductor } from '../bot/conductor';
import { MOVERS, type Mover, type MoverName } from '../bot/movers';
import { makePolicy } from '../bot/policies';
import {
  ENEMIES,
  LEVELUP,
  MAX_ALIVE_HARD,
  RUN,
  WEAPONS,
  madForestEnemyStats,
  xpForNextLevel,
  xpPickupMultiplier,
  type EnemyKind,
} from '../game/config';
import { Input } from '../game/input';
import { mountJoystick } from '../game/joystick';
import { STAGE_EVENTS, STAGE_WAVES } from '../game/madforest';
import { rollOffers, type PickOption } from '../game/picks';
import { mulberry32 } from '../game/rng';
import {
  FX_EVENT_TYPES,
  KICK_GEOMETRY,
  KIT_COLORS,
  PLAYER_FOOT_OFFSET,
  RunWorld,
  type FxEvent,
} from '../game/run';
import { RunView, type GroundPickView } from '../game/view';
import { ACTIVE_WEAPONS, CURRENT_ENEMIES } from './catalogs';
import { cloneFixture, type DevFixture } from './fixture';
import { DisposeBag } from './lifecycle';
import type { RoomMount } from './types';

const VIEW_W = 960;
const VIEW_H = 600;
const LIVE_MAX_STEPS = 8;
const KICK_REHIT_S = 1.35;

interface GroundReward {
  x: number;
  y: number;
  option: PickOption;
}

type WorldRoomFamily =
  | 'parity'
  | 'movement'
  | 'weapon'
  | 'enemy'
  | 'xp'
  | 'scratch'
  | 'stage'
  | 'kick'
  | 'horde'
  | 'audio-sync'
  | 'performance'
  | 'vfx'
  | 'accessibility'
  | 'world';

function roomFamily(slug: string): WorldRoomFamily {
  if (slug.includes('parity')) return 'parity';
  if (slug.includes('movement') || slug.includes('contact') || slug.includes('collision')) return 'movement';
  if (slug.includes('kick')) return 'kick';
  if (slug.includes('weapon') || slug.includes('projectile') || slug.includes('hit-area')) return 'weapon';
  if (slug.includes('enemy')) return 'enemy';
  if (slug.includes('xp') || slug.includes('reward') || slug.includes('pickup')) return 'xp';
  if (slug.includes('scratch') || slug.includes('sandbox')) return 'scratch';
  if (slug.includes('stage') || slug.includes('timeline')) return 'stage';
  if (slug.includes('horde') || slug.includes('pressure') || slug.includes('population')) return 'horde';
  if (slug.includes('audio-sync') || slug.includes('causality') || slug.includes('timing-boundary')) return 'audio-sync';
  if (slug.includes('performance') || slug.includes('stress')) return 'performance';
  if (slug.includes('vfx') || slug.includes('feedback') || slug.includes('effect')) return 'vfx';
  if (slug.includes('accessibility') || slug.includes('readability')) return 'accessibility';
  return 'world';
}

function numberValue(values: Record<string, string>, keys: readonly string[], fallback: number): number {
  for (const key of keys) {
    const n = Number(values[key]);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function stringValue(values: Record<string, string>, keys: readonly string[], fallback: string): string {
  for (const key of keys) {
    const value = values[key];
    if (value !== undefined && value !== '') return value;
  }
  return fallback;
}

function booleanValue(values: Record<string, string>, keys: readonly string[], fallback: boolean): boolean {
  const value = stringValue(values, keys, fallback ? '1' : '0').toLowerCase();
  return value === '1' || value === 'true' || value === 'on' || value === 'yes';
}

function asRole(value: string): Role {
  return ACTIVE_WEAPONS.some(({ role }) => role === value) ? value as Role : 'kick';
}

function asEnemy(value: string): EnemyKind {
  return CURRENT_ENEMIES.some(({ kind }) => kind === value) ? value as EnemyKind : 'redBat2';
}

function format(value: number, digits = 1): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(digits);
}

function makeButton(parent: HTMLElement, label: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = 'dev-button';
  button.type = 'button';
  button.textContent = label;
  button.onclick = onClick;
  parent.appendChild(button);
  return button;
}

function makeSelect(
  parent: HTMLElement,
  label: string,
  options: readonly { value: string; label: string }[],
  value: string,
  onChange: (value: string) => void,
): HTMLSelectElement {
  const wrap = document.createElement('label');
  wrap.className = 'dev-tool-field';
  wrap.append(`${label} `);
  const select = document.createElement('select');
  select.className = 'dev-select';
  for (const option of options) {
    const node = document.createElement('option');
    node.value = option.value;
    node.textContent = option.label;
    select.appendChild(node);
  }
  select.value = value;
  if (select.selectedIndex < 0) select.selectedIndex = 0;
  select.onchange = () => onChange(select.value);
  wrap.appendChild(select);
  parent.appendChild(wrap);
  return select;
}

function fxFor(type: FxEvent['type'], world: RunWorld, size: number): FxEvent {
  const { x, y } = world.player;
  const radius = 70 * size;
  switch (type) {
    case 'ring': return { type, x, y, radius, color: 0x59ffd1, dur: 0.6 };
    case 'death': return { type, x: x + 100, y, radius, color: 0xff6bd6, elite: size > 1.25 };
    case 'whip': return { type, x, y, side: world.player.facingX, area: size, color: KIT_COLORS.kick };
    case 'arc': return { type, x, y, angle: 0, arc: 0.8, radius: 120 * size, color: KIT_COLORS.clap };
    case 'dmg': return { type, x: x + 90, y: y - 40, amount: Math.round(15 * size), color: 0xffffff };
    case 'spark': return { type, x: x + 90, y, color: 0xffc93c, n: Math.round(8 * size), spread: 30 * size };
    case 'shake': return { type, mag: 8 * size, dur: 0.25 };
    case 'flash': return { type, color: 0xffffff, alpha: Math.min(0.5, 0.16 * size), dur: 0.25 };
    case 'slam': return { type, x, y, radius: 120 * size, color: 0xa06bff };
  }
}

/** Production-backed disposable arena used by the current Dev Campus Gyms.
 * Room definitions own presets and status; this adapter only interprets their
 * fixture values and configures real RunWorld/RunView/MusicEngine instances. */
export const mountWorldRoom: RoomMount = async (context) => {
  const family = roomFamily(context.room.slug);
  const initialState = cloneFixture(context.fixture);
  let state = cloneFixture(context.fixture);
  const bag = new DisposeBag();
  let disposed = false;
  let rebuilding = false;
  let input = new Input();
  let removeJoystick: (() => void) | null = null;
  let world: RunWorld | null = null;
  let view: RunView | null = null;
  let overlayGfx: Graphics | null = null;
  let engine: ReturnType<typeof context.createEngine> | null = null;
  let removeTrigger: (() => void) | null = null;
  let removeScheduledTrigger: (() => void) | null = null;
  let mover: Mover | null = null;
  let liveAccumulator = 0;
  let lastFrameMs = 0;
  let simMs = 0;
  let viewMs = 0;
  let fps = 0;
  let frameCount = 0;
  let fpsStartedAt = performance.now();
  let rewardsRaised = 0;
  let rewardQueue: number[] = [];
  let groundRewards: GroundReward[] = [];
  let rewardAwaitingBar = false;
  let presentRewardAfterAudioT: number | null = null;
  let rewardMomentT = 0;
  let rewardMomentScale = 1;
  let rewardHeals = 0;
  let rewardHistory: string[] = [];
  let rewardRng = mulberry32(state.seed ^ 0x9e3779b9);
  let ended = '';
  let nextVfxAt = 0;
  let scheduledLog: string[] = [];
  let heardLog: string[] = [];

  context.root.replaceChildren();
  const layout = document.createElement('div');
  layout.className = 'dev-world-room';
  context.root.appendChild(layout);

  const controls = document.createElement('div');
  controls.className = 'dev-room-controls';
  layout.appendChild(controls);
  const actions = document.createElement('div');
  actions.className = 'dev-room-actions';
  controls.appendChild(actions);
  const note = document.createElement('p');
  note.className = 'dev-room-note';
  controls.appendChild(note);
  const rewardChoices = document.createElement('div');
  rewardChoices.className = 'dev-room-actions dev-reward-choices';

  const stageWrap = document.createElement('div');
  stageWrap.className = 'dev-world-stage';
  stageWrap.style.height = 'min(64vh, 680px)';
  stageWrap.style.minHeight = '420px';
  stageWrap.style.position = 'relative';
  layout.appendChild(stageWrap);

  const metrics = document.createElement('pre');
  metrics.className = 'dev-world-metrics';
  metrics.setAttribute('aria-live', 'polite');
  layout.appendChild(metrics);

  const app = new Application();
  await app.init({
    width: VIEW_W,
    height: VIEW_H,
    background: 0x0a0b0f,
    antialias: true,
    autoStart: false,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
  });
  app.canvas.classList.add('dev-world-canvas');
  app.canvas.style.width = '100%';
  app.canvas.style.height = '100%';
  app.canvas.style.display = 'block';
  stageWrap.appendChild(app.canvas);
  removeJoystick = mountJoystick(stageWrap);

  const resize = (): void => {
    const rect = stageWrap.getBoundingClientRect();
    app.renderer.resize(Math.max(320, Math.round(rect.width || VIEW_W)), Math.max(320, Math.round(rect.height || VIEW_H)));
  };
  const observer = new ResizeObserver(resize);
  observer.observe(stageWrap);
  bag.add(() => observer.disconnect());
  bag.listen(document, 'pointerdown', () => engine?.resumeContextIfAllowed());
  resize();

  const fixtureValue = (key: string, value: string): void => {
    state.values[key] = value;
  };

  function selectedRole(): Role {
    return asRole(stringValue(state.values, ['role', 'weapon'], family === 'kick' ? 'kick' : 'kick'));
  }

  function selectedTier(): number {
    const presetTier = family === 'kick' && state.preset === 'opposite-delay' ? 2 : 1;
    return Math.max(1, Math.min(4, Math.trunc(numberValue(state.values, ['tier'], presetTier))));
  }

  function selectedEnemy(): EnemyKind {
    let fallback: EnemyKind = family === 'kick' ? 'greenMudman' : 'redBat2';
    if (family === 'enemy' && state.preset === 'elite-death') fallback = 'glowingBat';
    if (family === 'xp' && state.preset === 'stacked-levels') fallback = 'glowingBat';
    if (family === 'movement' && (state.preset.includes('knockback') || state.preset.includes('immune'))) fallback = 'ghost';
    return asEnemy(stringValue(state.values, ['enemy', 'kind'], fallback));
  }

  function selectedCount(): number {
    let fallback = 8;
    if (family === 'enemy' && state.preset === 'pursuit') fallback = 1;
    else if (family === 'enemy' && state.preset === 'overlap') fallback = 30;
    else if (family === 'enemy' && state.preset === 'elite-death') fallback = 1;
    else if (family === 'horde' && state.preset === 'steady-floor') fallback = 90;
    else if (family === 'performance') fallback = 300;
    else if (family === 'accessibility') fallback = 90;
    return Math.max(0, Math.min(MAX_ALIVE_HARD, Math.trunc(numberValue(state.values, ['count', 'population'], fallback))));
  }

  function selectedFormation(): string {
    let fallback = 'cluster';
    if (family === 'weapon') fallback = state.preset === 'single-target' ? 'single' : state.preset === 'line' ? 'line' : 'cluster';
    else if (family === 'enemy') fallback = state.preset === 'overlap' ? 'overlap' : state.preset === 'elite-death' ? 'contact' : 'pursuit';
    else if (family === 'kick') fallback = state.preset === 'repeat-lock' ? 'repeated-targets' : 'line';
    else if (family === 'movement') {
      fallback = state.preset === 'empty-grid' || state.preset === 'cell-edge'
        ? 'empty'
        : state.preset === 'squeeze'
          ? 'squeeze'
          : state.preset === 'immune-contact' || state.preset === 'knockback-level'
            ? 'contact'
            : state.preset === 'dense-overlap'
              ? 'overlap'
              : state.preset;
    }
    return stringValue(state.values, ['formation', 'targets', 'scenario'], fallback);
  }

  function selectedContrast(): string {
    const fallback = state.preset === 'low-contrast' ? 'low' : 'shipped';
    return stringValue(state.values, ['contrast'], fallback);
  }

  function selectedEffects(): string {
    const fallback = state.preset === 'reduced-motion' ? 'low-motion' : 'shipped';
    return stringValue(state.values, ['effects', 'motion'], fallback);
  }

  function accessibilityForcesMute(): boolean {
    return family === 'accessibility' && booleanValue(state.values, ['forceMuted'], state.preset === 'muted');
  }

  function effectiveAudio(): boolean {
    return state.audio && !accessibilityForcesMute();
  }

  function selectedMover(): MoverName | 'manual' {
    const raw = stringValue(state.values, ['mode', 'movement', 'mover'], state.preset).toLowerCase();
    if (raw.includes('greedy') || raw.includes('harvest')) return 'harvester';
    if (raw.includes('kiter')) return 'kiter';
    if (raw.includes('afk') || raw.includes('idle')) return 'afk';
    if ((family === 'parity' && state.preset !== 'manual-full') || family === 'stage' || family === 'horde') return 'kiter';
    return 'manual';
  }

  function checkpointS(): number {
    let presetTarget = 0;
    if (family === 'parity') presetTarget = state.preset === 'minute-4' ? 240 : state.preset === 'finale' ? 420 : 0;
    else if (family === 'stage') presetTarget = state.preset === 'flower-wall' ? 290 : state.preset === 'finale' ? 420 : 0;
    let target = numberValue(state.values, ['checkpoint', 'checkpointS', 'time', 'timeS', 'atS', 'minute'], presetTarget);
    if (state.values.minute !== undefined && target <= 7) target *= 60;
    if (family === 'stage' && state.values.event !== undefined) {
      const eventAt = Number(state.values.event);
      const before = numberValue(state.values, ['before', 'windowBefore'], 10);
      if (Number.isFinite(eventAt)) target = Math.max(0, eventAt - before);
    }
    return Math.max(0, Math.min(420, target));
  }

  function selectedStageEntry(): string {
    const fallback = state.preset === 'flower-wall' ? '300' : state.preset === 'finale' ? '420' : '0';
    return stringValue(state.values, ['event'], fallback);
  }

  function selectedFxType(): FxEvent['type'] {
    const fallback: FxEvent['type'] = state.preset === 'enemy-death' ? 'death' : state.preset === 'camera-feedback' ? 'shake' : 'ring';
    const wanted = stringValue(state.values, ['fx', 'effect'], fallback) as FxEvent['type'];
    return FX_EVENT_TYPES.includes(wanted) ? wanted : fallback;
  }

  function worldControl(): { x: number; y: number } {
    if (!world) return { x: 0, y: 0 };
    return mover ? mover(world) : input.axis();
  }

  function configureFormation(target: RunWorld, kind: EnemyKind, count: number, formation: string): void {
    target.clearEnemies();
    if (formation === 'empty' || count <= 0) return;
    const p = target.player;
    for (let i = 0; i < count; i++) {
      target.spawnEnemy(kind, (i / Math.max(1, count)) * Math.PI * 2, 1, true);
      const enemy = target.enemies[target.enemies.length - 1];
      if (!enemy) break;
      if (formation === 'line' || formation === 'fresh-targets') {
        enemy.x = p.x + 70 + i * (enemy.radius * 2 + 12);
        enemy.y = p.y + (i % 2 ? 14 : -14);
      } else if (formation === 'squeeze') {
        enemy.x = p.x + (i % 2 ? -1 : 1) * (p.radius + enemy.radius + 2);
        enemy.y = p.y + (Math.floor(i / 2) - count / 4) * (enemy.radius * 1.5);
      } else if (formation === 'dense' || formation === 'overlap') {
        const a = i * 2.399963;
        const r = Math.sqrt(i) * 4;
        enemy.x = p.x + Math.cos(a) * r;
        enemy.y = p.y + Math.sin(a) * r;
      } else if (formation === 'ring') {
        const a = (i / count) * Math.PI * 2;
        enemy.x = p.x + Math.cos(a) * 180;
        enemy.y = p.y + Math.sin(a) * 180;
      } else if (formation === 'contact' || formation === 'repeated-targets') {
        enemy.x = p.x + p.facingX * (p.radius + enemy.radius + 5 + i * 2);
        enemy.y = p.y + (i - (count - 1) / 2) * (enemy.radius * 1.2);
      } else {
        const a = (i / Math.max(1, count)) * Math.PI * 2;
        const r = 95 + (i % 3) * 24;
        enemy.x = p.x + Math.cos(a) * r;
        enemy.y = p.y + Math.sin(a) * r;
      }
    }
  }

  function configureStress(target: RunWorld): void {
    const preset = stringValue(
      state.values,
      ['stress', 'scenario'],
      state.preset === 'horde-cap'
        ? '500'
        : state.preset === 'projectile-storm'
          ? 'projectile-heavy'
          : state.preset === 'fx-pickups'
            ? 'fx-heavy'
            : state.preset,
    );
    const countFromPreset = Number(preset);
    const count = Number.isFinite(countFromPreset) ? countFromPreset : selectedCount();
    if (preset.includes('projectile')) {
      target.addWeapon('hat', 4);
      for (let i = 0; i < 180; i++) target.fireTrigger({ role: 'hat', time: target.timeS, velocity: 1, step: i % 64 });
    } else if (preset.includes('field')) {
      target.addWeapon('chord', 4);
      configureFormation(target, 'greenMudman', 120, 'cluster');
      for (let i = 0; i < 100; i++) target.fireTrigger({ role: 'chord', time: target.timeS, velocity: 1, step: i % 64 });
    } else if (preset.includes('fx') || preset.includes('pickup')) {
      for (let i = 0; i < 250; i++) target.fx?.push(fxFor(FX_EVENT_TYPES[i % FX_EVENT_TYPES.length], target, 0.6 + (i % 4) * 0.25));
      target.gems.length = 0;
      for (let i = 0; i < RUN.maxGems; i++) {
        const a = (i / RUN.maxGems) * Math.PI * 12;
        const r = 70 + (i % 30) * 8;
        target.gems.push({ x: target.player.x + Math.cos(a) * r, y: target.player.y + Math.sin(a) * r, xp: 1, tier: 'blue' });
      }
    } else if (preset.includes('gem')) {
      target.gems.length = 0;
      for (let i = 0; i < RUN.maxGems; i++) {
        const a = (i / RUN.maxGems) * Math.PI * 12;
        const r = 70 + (i % 30) * 8;
        target.gems.push({ x: target.player.x + Math.cos(a) * r, y: target.player.y + Math.sin(a) * r, xp: 1, tier: 'blue' });
      }
    } else {
      target.spawnRingOf(selectedEnemy(), Math.max(0, Math.min(MAX_ALIVE_HARD, count || 300)));
    }
  }

  function configureScenario(target: RunWorld): void {
    target.level = Math.max(1, Math.trunc(numberValue(state.values, ['level', 'playerLevel'], 1)));
    target.invincible = booleanValue(
      state.values,
      ['invincible'],
      family === 'weapon' || family === 'kick' || family === 'xp' || family === 'scratch' || family === 'stage' || family === 'horde' || family === 'performance',
    );
    if (family === 'movement') {
      const scenario = selectedFormation();
      const kind = scenario.includes('knockback') ? 'ghost' : selectedEnemy();
      const count = scenario === 'single' ? 1 : scenario === 'squeeze' ? 12 : scenario === 'dense' || scenario === 'overlap' ? 60 : selectedCount();
      configureFormation(target, kind, count, scenario);
    } else if (family === 'weapon' || family === 'kick') {
      const formation = selectedFormation();
      const kind = formation.includes('immune') ? 'ghost' : selectedEnemy();
      const count = formation === 'single' || formation === 'repeated-targets' ? 1 : Math.max(4, selectedCount());
      configureFormation(target, kind, count, formation);
      for (const enemy of target.enemies) enemy.hp = Math.max(enemy.hp, 500);
      if (family === 'kick') {
        const conf = WEAPONS.kick![selectedTier() - 1];
        const width = KICK_GEOMETRY.baseWidth * (conf.area ?? 1);
        const height = KICK_GEOMETRY.baseHeight * (conf.area ?? 1);
        const enemies = target.enemies;
        if (state.preset === 'front-edge' && enemies.length >= 4) {
          enemies[0].x = target.player.x + width - enemies[0].radius + 1;
          enemies[0].y = target.player.y;
          enemies[1].x = target.player.x + width + enemies[1].radius + 2;
          enemies[1].y = target.player.y;
          enemies[2].x = target.player.x + width * 0.7;
          enemies[2].y = target.player.y + height / 2 + enemies[2].radius - 1;
          enemies[3].x = target.player.x + width * 0.7;
          enemies[3].y = target.player.y + height / 2 + enemies[3].radius + 2;
        } else if (state.preset === 'opposite-delay' && enemies.length >= 2) {
          enemies[0].x = target.player.x + width * 0.65;
          enemies[1].x = target.player.x - width * 0.65;
          enemies[0].y = enemies[1].y = target.player.y;
        }
      }
    } else if (family === 'enemy') {
      configureFormation(target, selectedEnemy(), selectedCount(), selectedFormation());
    } else if (family === 'xp') {
      if (state.preset === 'single-level') configureFormation(target, selectedEnemy(), Math.max(3, selectedCount()), 'cluster');
      else target.clearEnemies();
    } else if (family === 'scratch') {
      configureFormation(target, selectedEnemy(), selectedCount(), selectedFormation());
      if (state.preset === 'full-band') {
        const slots = new Set<string>();
        for (const weapon of ACTIVE_WEAPONS) {
          if (slots.has(weapon.slot)) continue;
          slots.add(weapon.slot);
          target.addWeapon(weapon.role, 4);
        }
      }
    } else if (family === 'horde' && checkpointS() === 0) {
      const scenario = stringValue(state.values, ['scenario', 'formation'], state.preset);
      if (scenario.includes('starting')) target.spawnRingOf('redBat2', 30);
      else if (scenario.includes('elite')) target.spawnRingOf('glowingBat', 1);
      else if (!scenario.includes('sweep') && !scenario.includes('flower')) target.spawnRingOf(selectedEnemy(), selectedCount() || 90);
    } else if (family === 'performance') {
      configureStress(target);
    } else if (family === 'accessibility') {
      configureFormation(target, selectedEnemy(), selectedCount(), 'ring');
    }
    if (family === 'xp' && state.preset === 'full-build') {
      target.player.hp = 80;
      const slots = new Set<string>();
      for (const weapon of ACTIVE_WEAPONS) {
        if (slots.has(weapon.slot)) continue;
        slots.add(weapon.slot);
        target.addWeapon(weapon.role, 4);
      }
    }
  }

  function isScriptedRoom(): boolean {
    if (family === 'parity' || family === 'stage') return true;
    if (family === 'horde') {
      const scenario = stringValue(state.values, ['scenario', 'formation'], state.preset);
      return scenario.includes('sweep') || scenario.includes('flower') || checkpointS() > 0;
    }
    return false;
  }

  function effectiveCheckpoint(): number {
    const requested = checkpointS();
    if (requested > 0) return requested;
    if (family !== 'horde') return 0;
    const scenario = stringValue(state.values, ['scenario', 'formation'], state.preset);
    if (scenario.includes('flower')) return 300;
    if (scenario.includes('sweep')) return 125;
    return 0;
  }

  function drawOverlays(): void {
    if (!world || !overlayGfx) return;
    overlayGfx.clear();
    overlayGfx.visible = state.overlays;
    if (!state.overlays) return;
    const p = world.player;
    overlayGfx.circle(p.x, p.y, RUN.playerRadius).stroke({ width: 1.5, color: 0xffffff, alpha: 0.9 });
    overlayGfx.circle(p.x + PLAYER_FOOT_OFFSET.x, p.y + PLAYER_FOOT_OFFSET.y, 3).fill(0x59ffd1);
    if (family === 'movement' || family === 'xp' || family === 'accessibility') {
      overlayGfx.circle(p.x, p.y, RUN.magnetRadius).stroke({ width: 1, color: 0x3ce0ff, alpha: 0.75 });
      overlayGfx.circle(p.x, p.y, RUN.pickupRadius).stroke({ width: 1, color: 0xffffff, alpha: 0.8 });
    }
    if (family === 'xp') {
      overlayGfx.circle(p.x, p.y, LEVELUP.itemRadius).stroke({ width: 1.5, color: 0xffd76b, alpha: 0.8 });
      overlayGfx.circle(p.x, p.y, LEVELUP.enemyPushRadius).stroke({ width: 1, color: 0xff6bd6, alpha: 0.75 });
      overlayGfx.circle(p.x, p.y, LEVELUP.itemPickupRadius).stroke({ width: 1, color: 0x4dff88, alpha: 0.9 });
    }
    if (family === 'kick') {
      const area = WEAPONS.kick![selectedTier() - 1].area ?? 1;
      const width = KICK_GEOMETRY.baseWidth * area;
      const height = KICK_GEOMETRY.baseHeight * area;
      const x = p.facingX > 0 ? p.x : p.x - width;
      overlayGfx.rect(x, p.y - height / 2, width, height).stroke({ width: 2, color: KIT_COLORS.kick, alpha: 0.9 });
      if ((WEAPONS.kick![selectedTier() - 1].amount ?? 1) > 1) {
        const oppositeX = p.facingX > 0 ? p.x - width : p.x;
        overlayGfx.rect(oppositeX, p.y - height / 2, width, height).stroke({ width: 1, color: KIT_COLORS.kick, alpha: 0.55 });
      }
    }
    const limit = family === 'performance' ? 80 : world.enemies.length;
    for (let i = 0; i < Math.min(limit, world.enemies.length); i++) {
      const enemy = world.enemies[i];
      overlayGfx.circle(enemy.x, enemy.y, enemy.radius).stroke({ width: 1, color: enemy.knockbackMul === 0 ? 0xff4f7d : 0xffffff, alpha: 0.35 });
    }
  }

  function applyEngineRate(): void {
    if (engine) engine.clock.rate = state.speed * (family === 'xp' ? rewardMomentScale : 1);
  }

  function renderRewardChoices(): void {
    if (family !== 'xp') return;
    rewardChoices.replaceChildren();
    if (groundRewards.length === 0) {
      const status = document.createElement('span');
      status.className = 'dev-room-note';
      status.textContent = rewardAwaitingBar
        ? 'Choice collected — waiting for the next heard bar.'
        : rewardQueue.length > 0
          ? `${rewardQueue.length} reward${rewardQueue.length === 1 ? '' : 's'} queued.`
          : 'No ground choice is active.';
      rewardChoices.appendChild(status);
      return;
    }
    for (const item of groundRewards) {
      const current = world?.tiers.get(item.option.role) ?? 0;
      const level = current > 0 ? `${current} → ${item.option.tier}` : '1';
      makeButton(
        rewardChoices,
        `Collect ${ROLE_META[item.option.role].name} ${level}`,
        () => collectGroundReward(item),
      );
    }
  }

  function clearGroundRewards(): void {
    groundRewards = [];
    view?.setGroundPicks([]);
    renderRewardChoices();
  }

  function endRewardMoment(): void {
    rewardMomentT = 0;
    if (rewardMomentScale !== 1) {
      rewardMomentScale = 1;
      applyEngineRate();
      engine?.restoreWeapons();
    }
  }

  function startRewardMoment(x: number, y: number): void {
    if (!engine || !view) return;
    rewardMomentT = LEVELUP.momentS;
    rewardMomentScale = LEVELUP.slowScale;
    applyEngineRate();
    engine.duckWeapons(LEVELUP.duckDepth, LEVELUP.momentS);
    engine.playLevelCue();
    view.levelBurst(x, y);
    rewardHistory.push(`moment: ${LEVELUP.slowScale}× sim/audio, weapons ×${LEVELUP.duckDepth}`);
    rewardHistory = rewardHistory.slice(-6);
  }

  function dropGroundRewards(options: PickOption[]): void {
    if (!world || !view) return;
    const w = world;
    const cx = w.player.x;
    const cy = w.player.y;
    const items: GroundReward[] = [];
    const payload: GroundPickView[] = [];
    for (let i = 0; i < options.length; i++) {
      const option = options[i];
      const radians = (LEVELUP.angles[i % LEVELUP.angles.length] * Math.PI) / 180;
      const x = cx + Math.cos(radians) * LEVELUP.itemRadius;
      const y = cy + Math.sin(radians) * LEVELUP.itemRadius;
      const previous = w.tiers.get(option.role) ?? 0;
      items.push({ x, y, option });
      payload.push({
        x,
        y,
        role: option.role,
        color: KIT_COLORS[option.role],
        name: context.kits.get(option.role)?.name ?? ROLE_META[option.role].name,
        level: previous > 0 ? `${previous} → ${option.tier}` : '1',
      });
    }
    groundRewards = items;
    view.setGroundPicks(payload);
    w.shoveEnemiesOut(cx, cy, LEVELUP.enemyPushRadius);
    startRewardMoment(cx, cy);
    rewardHistory.push(`dropped ${items.length} choices at radius ${LEVELUP.itemRadius}`);
    rewardHistory = rewardHistory.slice(-6);
    renderRewardChoices();
  }

  function presentNextReward(): void {
    if (family !== 'xp' || rebuilding || !world || !engine || !view) return;
    if (groundRewards.length > 0 || rewardAwaitingBar || presentRewardAfterAudioT !== null) return;
    while (rewardQueue.length > 0 && groundRewards.length === 0) {
      rewardQueue.shift();
      const options = rollOffers(world.tiers, rewardRng, world.timeS);
      if (options.length === 0) {
        const before = world.player.hp;
        world.player.hp = Math.min(RUN.playerHp, world.player.hp + 15);
        rewardHeals++;
        rewardHistory.push(`full build: +${format(world.player.hp - before)} hp`);
        rewardHistory = rewardHistory.slice(-6);
        continue;
      }
      dropGroundRewards(options);
    }
    renderRewardChoices();
  }

  function enqueueRewards(count: number): void {
    if (family !== 'xp' || !world) return;
    for (let i = 0; i < count; i++) {
      rewardQueue.push(world.level);
      rewardsRaised++;
    }
    rewardHistory.push(`queued ${count} reward${count === 1 ? '' : 's'}`);
    rewardHistory = rewardHistory.slice(-6);
    presentNextReward();
    renderRewardChoices();
  }

  function collectGroundReward(item: GroundReward): void {
    if (!world || !engine || !groundRewards.includes(item)) return;
    const w = world;
    const ownedEngine = engine;
    const option = item.option;
    endRewardMoment();
    clearGroundRewards();
    rewardAwaitingBar = true;
    rewardHistory.push(`collected ${ROLE_META[option.role].name}; waiting for bar`);
    rewardHistory = rewardHistory.slice(-6);
    renderRewardChoices();
    ownedEngine.resumeContextIfAllowed();
    ownedEngine.atNextBar((barAudioTime) => {
      if (world !== w || engine !== ownedEngine) return;
      ownedEngine.setVoiceTier(option.role, option.tier);
      ownedEngine.setVoiceEnabled(option.role, true);
      ownedEngine.atAudioTime(barAudioTime, () => {
        if (world !== w || engine !== ownedEngine) return;
        w.addWeapon(option.role, option.tier);
        view?.flourish(w.player.x, w.player.y);
        rewardAwaitingBar = false;
        presentRewardAfterAudioT = barAudioTime;
        rewardHistory.push(`${ROLE_META[option.role].name} tier ${option.tier} applied at heard bar ${barAudioTime.toFixed(3)}`);
        rewardHistory = rewardHistory.slice(-6);
        renderRewardChoices();
      });
    });
  }

  function resetRewardFlow(): void {
    endRewardMoment();
    rewardQueue = [];
    rewardAwaitingBar = false;
    presentRewardAfterAudioT = null;
    rewardHeals = 0;
    rewardHistory = [];
    rewardRng = mulberry32((state.seed ^ 0x9e3779b9) >>> 0);
    clearGroundRewards();
  }

  function configureEngine(): void {
    if (!engine || !world) return;
    for (const role of ROLES) engine.setVoiceEnabled(role, false);
    for (const [role, tier] of world.tiers) {
      engine.setVoiceTier(role, tier);
      engine.setVoiceEnabled(role, true);
    }
    applyEngineRate();
    engine.setMasterGain(effectiveAudio() ? 0.8 : 0);
    removeScheduledTrigger = engine.addScheduledTriggerListener((trigger) => {
      scheduledLog.push(`${trigger.role} step ${trigger.step} scheduled @${trigger.time.toFixed(3)}`);
      scheduledLog = scheduledLog.slice(-8);
    });
    removeTrigger = engine.addTriggerListener((trigger) => {
      if (!world || rebuilding) return;
      heardLog.push(`${trigger.role} step ${trigger.step} heard/fire @${engine!.ctx.currentTime.toFixed(3)}`);
      heardLog = heardLog.slice(-8);
      world.fireTrigger(trigger);
    });
    engine.clock.start();
    if (!state.playing) {
      engine.clock.pause();
      engine.holdTransport();
    } else {
      engine.resumeContextIfAllowed();
    }
  }

  async function disposeRuntime(): Promise<void> {
    removeTrigger?.();
    removeTrigger = null;
    removeScheduledTrigger?.();
    removeScheduledTrigger = null;
    if (view) {
      view.stage.removeFromParent();
      view.destroy();
      view = null;
    }
    overlayGfx = null;
    world = null;
    if (engine) {
      engine.releaseTransport();
      engine.dispose();
      engine = null;
      // Never await resume here: browsers may leave its promise pending until
      // the next trusted gesture, which must not block room disposal. The
      // navigation click usually resumes immediately; otherwise the app-level
      // pointer recovery handles the next interaction.
      if (context.audioContext.state === 'suspended') {
        void context.audioContext.resume().catch(() => undefined);
      }
    }
  }

  async function rebuild(next = state): Promise<void> {
    if (disposed || rebuilding) return;
    rebuilding = true;
    metrics.textContent = 'Reconstructing production state with fixed 1/60 s ticks…';
    state = cloneFixture(next);
    resetRewardFlow();
    liveAccumulator = 0;
    rewardsRaised = 0;
    ended = '';
    nextVfxAt = 0;
    scheduledLog = [];
    heardLog = [];
    await disposeRuntime();
    input.dispose();
    removeJoystick?.();
    input = new Input();
    removeJoystick = mountJoystick(stageWrap);

    const mode = selectedMover();
    mover = mode === 'manual' ? null : MOVERS[mode]();
    const seed = state.seed >>> 0;
    const rng = mulberry32(seed);
    let checkpointConductor: VirtualConductor | null = null;
    const events = {
      onLevelUp(level: number): void {
        if (checkpointConductor) {
          rewardsRaised++;
          checkpointConductor.onLevelUp();
        } else if (family === 'xp') {
          rewardQueue.push(level);
          rewardsRaised++;
          rewardHistory.push(`production XP raised level ${level} reward`);
          rewardHistory = rewardHistory.slice(-6);
        } else {
          rewardsRaised++;
        }
      },
      onDeath(): void { ended = 'death'; },
      onVictory(): void { ended = 'victory'; },
      onHit(): void {},
    };
    const created = new RunWorld(app.screen, events, {
      scripted: isScriptedRoom(),
      rng,
      control: () => worldControl(),
      fx: true,
    });
    world = created;
    created.powerMul = SOUNDSET.powerMul;
    const role = selectedRole();
    const tier = selectedTier();
    const checkpoint = effectiveCheckpoint();
    if (checkpoint > 0) {
      // fastForward creates its own production VirtualConductor. The callback
      // above must point at it while XP rewards are raised during world.update.
      // World, offer rolls, and stage events consume one seeded stream, as in
      // the production bot/replay path. A separate RNG here would still look
      // repeatable while reconstructing the wrong canonical state.
      configureScenario(created);
      const arrivalInvincible = created.invincible;
      // A manual player has no recorded input before a checkpoint. Transit
      // therefore uses the production Kiter plus the existing invincibility
      // flag, then restores normal contact damage at the checkpoint. Every
      // stage/spawn/weapon/XP tick is still simulated; no world field is
      // teleported or synthesized.
      if (family === 'parity') created.invincible = true;
      const policy = makePolicy('deep');
      checkpointConductor = new VirtualConductor(created, policy.choose, rng);
      checkpointConductor.start(role);
      const steps = Math.ceil(checkpoint / SIM_DT);
      for (let i = 0; i < steps; i++) {
        checkpointConductor.tick(SIM_DT);
        created.update(SIM_DT);
        if (created.fx) created.fx.length = 0;
        if (!created.invincible && created.player.hp <= 0) {
          ended = `checkpoint stopped at ${created.timeS.toFixed(1)}s: production player died`;
          break;
        }
        if (i > 0 && i % 3600 === 0) await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      }
      checkpointConductor = null;
      created.invincible = arrivalInvincible;
    } else {
      created.addWeapon(role, tier);
      configureScenario(created);
    }
    if (created.tiers.get(role) !== tier && (family === 'weapon' || family === 'kick' || family === 'scratch' || family === 'performance')) {
      created.addWeapon(role, tier);
    }
    // Establish the spatial hash before an immediate preview button can fire.
    if (!isScriptedRoom()) created.update(SIM_DT);
    view = new RunView(created, app.screen);
    overlayGfx = new Graphics();
    view.stage.addChild(overlayGfx);
    app.stage.addChild(view.stage);
    engine = context.createEngine();
    configureEngine();
    rebuilding = false;
    if (family === 'vfx') triggerVfxPreset();
    if (family === 'xp') {
      enqueueRewards(state.preset === 'stacked-levels' ? 3 : 1);
    }
    drawOverlays();
    view.update(0);
    app.render();
  }

  function selectedEnemyMetrics(target: RunWorld): string[] {
    const kind = selectedEnemy();
    const s = madForestEnemyStats(kind, target.level);
    const conf = ENEMIES[kind];
    return [
      `enemy ${kind} · level ${target.level}`,
      `hp ${format(s.hp)} · damage ${format(s.damage)} · speed ${format(s.speed)} px/s · xp ${format(s.xp)}`,
      `radius ${format(s.radius)} · knockback ×${format(s.knockback, 2)} · class ${conf.boss ? 'boss' : conf.fixedDirection || kind === 'flower' ? 'event' : 'regular'}`,
    ];
  }

  function metricLines(target: RunWorld): string[] {
    const axis = worldControl();
    const common = [
      `seed ${state.seed >>> 0} · fixed dt ${SIM_DT.toFixed(5)} s · speed ${state.speed.toFixed(2)}×`,
      `time ${target.timeS.toFixed(2)} s · hp ${format(target.player.hp)}/${RUN.playerHp} · level ${target.level} · xp ${format(target.xp)}/${xpForNextLevel(target.level)}`,
      `enemies ${target.enemyCount}/${ENEMIES.maxAlive} soft/${MAX_ALIVE_HARD} hard · projectiles ${target.projectileCount} · fields ${target.zones.length} · gems ${target.gems.length}/${RUN.maxGems}`,
      `kills ${target.kills} · sim ${simMs.toFixed(2)} ms/frame · view ${viewMs.toFixed(2)} ms/frame · fps ${fps}`,
    ];
    if (ended) common.push(`run state: ${ended}`);
    if (family === 'movement') {
      common.push(
        `input (${axis.x.toFixed(2)}, ${axis.y.toFixed(2)}) · speed target ${RUN.playerSpeed.toFixed(2)} px/s · diagonal normalized`,
        `armor ${RUN.playerArmor} · contact lock ${Math.round(RUN.iframesS * 1000)} ms · iframes remaining ${Math.max(0, target.player.iframesT).toFixed(3)} s`,
        `player radius ${RUN.playerRadius.toFixed(2)} · feet anchor (${PLAYER_FOOT_OFFSET.x.toFixed(2)}, ${PLAYER_FOOT_OFFSET.y.toFixed(2)})`,
      );
    } else if (family === 'weapon' || family === 'kick') {
      const role = selectedRole();
      const tier = selectedTier();
      const conf = WEAPONS[role]![tier - 1];
      common.push(
        `${ROLE_META[role].name} tier ${tier} · ${JSON.stringify(conf)}`,
        `effective damage ${format(target.damageByRole[role] ?? 0)} · kills ${target.killsByRole[role] ?? 0}`,
      );
      if (role === 'kick') common.push(`front strip now · opposite strip +100 ms at tiers II–IV · shared target re-hit lock ${KICK_REHIT_S.toFixed(2)} s (locked production rule)`);
    } else if (family === 'enemy') {
      common.push(...selectedEnemyMetrics(target));
    } else if (family === 'xp') {
      common.push(
        `gem magnet ${RUN.magnetRadius} · gem collect ${RUN.pickupRadius} · pull ${RUN.gemPullSpeed}/s · growth ×${xpPickupMultiplier(target.level)}`,
        `ground choice ring ${LEVELUP.itemRadius} · enemy shove ${LEVELUP.enemyPushRadius} · fixed choice collect ${LEVELUP.itemPickupRadius}`,
        `reward moment ${rewardMomentT.toFixed(2)}s remaining at ${rewardMomentScale.toFixed(2)}× · weapons volume ×${LEVELUP.duckDepth}`,
        `rewards raised ${rewardsRaised} · queued ${rewardQueue.length} · on ground ${groundRewards.length} · waiting bar ${rewardAwaitingBar ? 'yes' : 'no'} · heal fallbacks ${rewardHeals}`,
        ...rewardHistory.map((entry) => `  ${entry}`),
      );
    } else if (family === 'stage' || family === 'parity') {
      const wave = [...STAGE_WAVES].reverse().find((row) => row.atS <= target.timeS);
      common.push(
        wave ? `active wave @${wave.atS}s · pattern ${wave.pattern.join('+')} · minimum ${wave.minimum} · interval ${wave.intervalS}s` : 'before first wave',
        `stage rows ${STAGE_WAVES.length} · events ${STAGE_EVENTS.length} · locked boundary ${RUN.durationS}s`,
      );
      if (family === 'parity' && checkpointS() > 0) common.push('checkpoint transit: fixed ticks + production Kiter/deep picks + production invincibility flag; contact damage restored on arrival');
    } else if (family === 'horde') {
      let regular = 0, event = 0, boss = 0;
      for (const enemy of target.enemies) enemy.spawnClass === 'boss' ? boss++ : enemy.spawnClass === 'event' ? event++ : regular++;
      common.push(`population classes · regular ${regular} · event ${event} · boss ${boss}`);
    } else if (family === 'audio-sync') {
      const audio = engine?.debugAudioState();
      common.push(
        `clock ${SOUNDSET.bpm} BPM · swing ${SOUNDSET.swing} · rate ${state.speed.toFixed(2)}× · master ${audio?.master.toFixed(2) ?? '—'} · pending ${audio?.pendingTriggers ?? 0}`,
        'scheduled:', ...scheduledLog.map((line) => `  ${line}`), 'heard / production fireTrigger:', ...heardLog.map((line) => `  ${line}`),
      );
    } else if (family === 'performance') {
      common.push(`rendered enemy overlays ${state.overlays ? Math.min(80, target.enemyCount) : 0} · cosmetic FX ${target.fx?.length ?? 0}`);
    } else if (family === 'vfx') {
      common.push('FX queue is cosmetic and drained by the production RunView; its randomness never enters seeded simulation state.');
    } else if (family === 'accessibility') {
      common.push(`audio ${effectiveAudio() ? 'on' : 'muted'} · overlays ${state.overlays ? 'on' : 'off'} · effect intensity ${selectedEffects()}`);
    }
    return common;
  }

  function refreshMetrics(): void {
    if (!world) return;
    metrics.style.display = state.overlays ? '' : 'none';
    metrics.textContent = metricLines(world).join('\n');
  }

  function triggerSelectedWeapon(): void {
    if (!engine || !world) return;
    const role = selectedRole();
    engine.preview(role, { step: 0, velocity: Math.max(0.05, Math.min(1, numberValue(state.values, ['velocity', 'strength'], 0.9))), note: ROLE_META[role].pitched ? 0 : undefined });
  }

  function triggerSelectedFx(): void {
    if (!world?.fx) return;
    world.fx.push(fxFor(selectedFxType(), world, numberValue(state.values, ['size', 'intensity'], 1)));
  }

  function triggerVfxPreset(): void {
    if (!world || !view || !engine) return;
    if (state.preset === 'level-moment') {
      view.levelBurst(world.player.x, world.player.y);
      engine.duckWeapons(LEVELUP.duckDepth, LEVELUP.momentS);
      engine.playLevelCue();
    } else if (state.preset === 'camera-feedback') {
      world.fx?.push(fxFor('shake', world, numberValue(state.values, ['size', 'intensity'], 1)));
      world.fx?.push(fxFor('flash', world, numberValue(state.values, ['size', 'intensity'], 1)));
    } else {
      triggerSelectedFx();
    }
  }

  function applyAccessibility(): void {
    const contrast = selectedContrast();
    app.canvas.style.filter = contrast === 'high' ? 'contrast(1.7) saturate(0.8)' : contrast === 'low' ? 'contrast(0.65) saturate(0.55)' : contrast === 'mono' ? 'grayscale(1) contrast(1.2)' : '';
  }

  const roleOptions = ACTIVE_WEAPONS.map(({ role, name }) => ({ value: role, label: name }));
  const enemyOptions = CURRENT_ENEMIES.map(({ kind, name }) => ({ value: kind, label: name }));
  const tierOptions = [1, 2, 3, 4].map((tier) => ({ value: String(tier), label: `Tier ${tier}` }));
  const countOptions = [1, 8, 30, 45, 60, 90, 150, 240, 300, 500].map((count) => ({ value: String(count), label: String(count) }));
  const rebuildWith = (key: string, value: string): void => {
    fixtureValue(key, value);
    void rebuild();
  };

  if (family === 'parity') {
    makeSelect(actions, 'checkpoint', [0, 60, 120, 180, 240, 300, 360, 420].map((s) => ({ value: String(s), label: `${Math.floor(s / 60)}:00` })), String(checkpointS()), (v) => rebuildWith('checkpoint', v));
    makeSelect(actions, 'movement', [{ value: 'manual', label: 'Manual' }, { value: 'kiter', label: 'Kiter' }, { value: 'harvester', label: 'Greedy' }], selectedMover(), (v) => rebuildWith('mode', v));
    note.textContent = 'Hands gate: movement/contact · density/events · Kick · other areas · enemy readability · death satisfaction. This room records observations; it never passes the gate.';
  } else if (family === 'movement') {
    makeSelect(actions, 'case', ['empty', 'single', 'squeeze', 'dense', 'knockback-resistant'].map((v) => ({ value: v, label: v })), selectedFormation(), (v) => rebuildWith('formation', v));
    makeSelect(actions, 'control', [{ value: 'manual', label: 'Manual/touch' }, { value: 'afk', label: 'Stationary' }, { value: 'kiter', label: 'Kiter' }], selectedMover(), (v) => rebuildWith('mode', v));
    note.textContent = 'White circles are production bodies; cyan is the source-style feet anchor. WASD/arrows and the touch joystick use the production Input seam.';
  } else if (family === 'weapon' || family === 'kick') {
    makeSelect(actions, 'weapon', family === 'kick' ? roleOptions.filter(({ value }) => value === 'kick') : roleOptions, selectedRole(), (v) => rebuildWith('role', v));
    makeSelect(actions, 'tier', tierOptions, String(selectedTier()), (v) => rebuildWith('tier', v));
    makeSelect(actions, 'targets', ['single', 'line', 'cluster', 'ring', 'moving-horde', 'high-health', 'knockback-immune', 'fresh-targets', 'repeated-targets'].map((v) => ({ value: v, label: v })), selectedFormation(), (v) => rebuildWith('formation', v));
    makeButton(actions, 'Fire production trigger', triggerSelectedWeapon);
    makeButton(actions, 'Face left/right', () => { if (world) world.player.facingX = world.player.facingX === 1 ? -1 : 1; });
    note.textContent = family === 'kick' ? 'The solid strip is the current facing side; the faint strip is the 100 ms delayed opposite side. Damage is measured from production attribution.' : 'Every selection uses the canonical fourteen-weapon catalog and the production fireTrigger path. Crash and riser cannot enter this selector.';
  } else if (family === 'enemy') {
    makeSelect(actions, 'enemy', enemyOptions, selectedEnemy(), (v) => rebuildWith('enemy', v));
    makeSelect(actions, 'count', countOptions, String(selectedCount()), (v) => rebuildWith('count', v));
    makeSelect(actions, 'formation', ['pursuit', 'contact', 'overlap', 'ring', 'line'].map((v) => ({ value: v, label: v })), selectedFormation(), (v) => rebuildWith('formation', v));
    makeSelect(actions, 'player level', [1, 5, 10, 20, 40].map((v) => ({ value: String(v), label: String(v) })), String(numberValue(state.values, ['level'], 1)), (v) => rebuildWith('level', v));
    note.textContent = 'Stats and the selector come from the current Mad Forest registry; historical enemies are intentionally absent.';
  } else if (family === 'xp') {
    makeSelect(actions, 'carrier', enemyOptions, selectedEnemy(), (v) => rebuildWith('enemy', v));
    makeButton(actions, 'Queue one reward', () => enqueueRewards(1));
    makeButton(actions, 'Queue three stacked rewards', () => enqueueRewards(3));
    makeButton(actions, 'Spawn XP carriers', () => world && configureFormation(world, selectedEnemy(), Math.max(3, selectedCount()), 'cluster'));
    makeButton(actions, 'Shove to production reward radius', () => world?.shoveEnemiesOut(world.player.x, world.player.y, LEVELUP.enemyPushRadius));
    makeButton(actions, 'Fire weapon at XP carriers', triggerSelectedWeapon);
    controls.appendChild(rewardChoices);
    note.textContent = 'Walk onto a visible choice using WASD/touch, or use its explicit Collect button. Offers, fixed radii, shove, slow/duck/cue/burst, and heard-time bar entry all use production seams.';
  } else if (family === 'scratch') {
    makeSelect(actions, 'weapon', roleOptions, selectedRole(), (v) => rebuildWith('role', v));
    makeSelect(actions, 'tier', tierOptions, String(selectedTier()), (v) => rebuildWith('tier', v));
    makeSelect(actions, 'enemy', enemyOptions, selectedEnemy(), (v) => rebuildWith('enemy', v));
    makeSelect(actions, 'count', countOptions, String(selectedCount()), (v) => rebuildWith('count', v));
    makeButton(actions, 'Spawn more', () => { if (world) for (let i = 0; i < selectedCount(); i++) world.spawnEnemy(selectedEnemy()); });
    makeButton(actions, 'Clear enemies', () => world?.clearEnemies());
    makeButton(actions, 'Fire weapon', triggerSelectedWeapon);
    note.textContent = 'Scratch Gym is the flexible stage-off arena. Focused rooms remain the preferred source for repeatable judgments.';
  } else if (family === 'stage') {
    const timelineOptions = [
      ...STAGE_WAVES.map((wave) => ({ value: String(wave.atS), label: `${Math.floor(wave.atS / 60)}:00 wave · ${wave.pattern.join('+')}` })),
      ...STAGE_EVENTS.map((event) => ({ value: String(event.atS), label: `${Math.floor(event.atS / 60)}:${String(event.atS % 60).padStart(2, '0')} ${event.type}` })),
    ].sort((a, b) => Number(a.value) - Number(b.value));
    makeSelect(actions, 'timeline entry', timelineOptions, selectedStageEntry(), (v) => rebuildWith('event', v));
    makeSelect(actions, 'window before', [10, 30, 60].map((v) => ({ value: String(v), label: `${v}s` })), String(numberValue(state.values, ['before'], 10)), (v) => rebuildWith('before', v));
    note.textContent = 'Selecting an entry replays every production fixed tick from 0:00. The locked 8:00 boundary is shown, never moved earlier.';
  } else if (family === 'horde') {
    makeSelect(actions, 'pressure', ['regular-pursuit', 'starting-ring', 'bat-sweep', 'flower-enclosure', 'elite-entry', 'mixed-pressure'].map((v) => ({ value: v, label: v })), stringValue(state.values, ['scenario'], state.preset), (v) => rebuildWith('scenario', v));
    makeSelect(actions, 'population', countOptions, String(selectedCount()), (v) => rebuildWith('count', v));
    makeButton(actions, 'Clear', () => world?.clearEnemies());
    note.textContent = 'Bat sweeps and flower enclosure are reached through the production stage director. Class counts expose quota bodies versus event/boss bodies.';
  } else if (family === 'audio-sync') {
    makeSelect(actions, 'weapon', roleOptions, selectedRole(), (v) => rebuildWith('role', v));
    makeSelect(actions, 'tier', tierOptions, String(selectedTier()), (v) => rebuildWith('tier', v));
    makeButton(actions, 'Preview one source event', triggerSelectedWeapon);
    makeButton(actions, 'Tier-up on next heard bar', () => {
      if (!engine || !world) return;
      const role = selectedRole();
      const tier = Math.min(4, (world.tiers.get(role) ?? selectedTier()) + 1);
      engine.atNextBar((audioTime) => {
        engine!.setVoiceTier(role, tier);
        engine!.atAudioTime(audioTime, () => world?.addWeapon(role, tier));
      });
    });
    note.textContent = 'The log pairs the production scheduler event with the due trigger that calls RunWorld.fireTrigger. Audio mute changes only master gain; gameplay dispatch continues.';
  } else if (family === 'performance') {
    const initialStress = stringValue(
      state.values,
      ['stress', 'scenario'],
      state.preset === 'horde-cap' ? '500' : state.preset === 'projectile-storm' ? 'projectile-heavy' : state.preset === 'fx-pickups' ? 'fx-heavy' : state.preset,
    );
    makeSelect(actions, 'stress', ['45', '90', '150', '240', '300', '500', 'projectile-heavy', 'field-heavy', 'fx-heavy', 'gem-cap'].map((v) => ({ value: v, label: v })), initialStress, (v) => rebuildWith('stress', v));
    note.textContent = 'Timing separates fixed simulation work from production RunView work. Disable overlays/audio to isolate costs without changing the seeded world.';
  } else if (family === 'vfx') {
    makeSelect(actions, 'effect', FX_EVENT_TYPES.map((v) => ({ value: v, label: v })), selectedFxType(), (v) => fixtureValue('fx', v));
    makeSelect(actions, 'size', [0.5, 1, 1.5, 2].map((v) => ({ value: String(v), label: `${v}×` })), String(numberValue(state.values, ['size'], 1)), (v) => fixtureValue('size', v));
    makeSelect(actions, 'loop', [{ value: '1', label: 'On' }, { value: '0', label: 'Off' }], stringValue(state.values, ['loop'], '1'), (v) => fixtureValue('loop', v));
    makeButton(actions, 'Trigger production view effect', triggerVfxPreset);
    makeButton(actions, 'Level-up flourish', () => world && view?.flourish(world.player.x, world.player.y));
    makeButton(actions, 'Level-up burst', () => world && view?.levelBurst(world.player.x, world.player.y));
    note.textContent = 'Temporary parameters live only in this fixture. Reset restores shipped values; nothing writes production configuration.';
  } else if (family === 'accessibility') {
    makeSelect(actions, 'audio condition', [{ value: '0', label: 'Shipped' }, { value: '1', label: 'Forced muted' }], accessibilityForcesMute() ? '1' : '0', (v) => { fixtureValue('forceMuted', v); engine?.setMasterGain(effectiveAudio() ? 0.8 : 0); });
    makeSelect(actions, 'contrast', ['shipped', 'high', 'low', 'mono'].map((v) => ({ value: v, label: v })), selectedContrast(), (v) => { fixtureValue('contrast', v); applyAccessibility(); });
    makeSelect(actions, 'effects', ['shipped', 'low-motion', 'effects-off'].map((v) => ({ value: v, label: v })), selectedEffects(), (v) => fixtureValue('effects', v));
    makeSelect(actions, 'density', countOptions, String(selectedCount()), (v) => rebuildWith('count', v));
    note.textContent = 'These are evaluation conditions, not promised player-facing settings. The room reports readability problems and does not set accessibility policy.';
  } else {
    makeSelect(actions, 'enemy', enemyOptions, selectedEnemy(), (v) => rebuildWith('enemy', v));
    makeButton(actions, 'Spawn ring', () => world?.spawnRingOf(selectedEnemy(), selectedCount()));
    note.textContent = 'Live production world/view inspection surface.';
  }

  applyAccessibility();
  await rebuild(state);

  bag.animationFrame((timeMs) => {
    if (disposed || rebuilding || !world || !view) return;
    if (lastFrameMs === 0) lastFrameMs = timeMs;
    const frameS = Math.min(0.1, Math.max(0, (timeMs - lastFrameMs) / 1000));
    lastFrameMs = timeMs;
    frameCount++;
    if (timeMs - fpsStartedAt >= 1000) {
      fps = Math.round((frameCount * 1000) / (timeMs - fpsStartedAt));
      frameCount = 0;
      fpsStartedAt = timeMs;
    }
    let effectiveRoomSpeed = state.speed * (family === 'xp' ? rewardMomentScale : 1);
    if (state.playing) {
      engine?.update();
      if (family === 'xp' && rewardMomentT > 0) {
        rewardMomentT = Math.max(0, rewardMomentT - frameS);
        if (rewardMomentT === 0) endRewardMoment();
      }
      effectiveRoomSpeed = state.speed * (family === 'xp' ? rewardMomentScale : 1);
      liveAccumulator = Math.min(liveAccumulator + frameS * effectiveRoomSpeed, SIM_DT * Math.max(LIVE_MAX_STEPS, Math.ceil(LIVE_MAX_STEPS * effectiveRoomSpeed)));
      const start = performance.now();
      let steps = 0;
      const maxSteps = Math.max(1, Math.ceil(LIVE_MAX_STEPS * effectiveRoomSpeed));
      while (liveAccumulator >= SIM_DT && steps < maxSteps) {
        liveAccumulator -= SIM_DT;
        world.update(SIM_DT);
        steps++;
      }
      simMs = performance.now() - start;
      if (
        family === 'xp' &&
        presentRewardAfterAudioT !== null &&
        engine &&
        engine.ctx.currentTime >= presentRewardAfterAudioT &&
        steps > 0
      ) {
        presentRewardAfterAudioT = null;
      }
      if (family === 'xp' && steps > 0) {
        presentNextReward();
        if (groundRewards.length > 0) {
          const pickupR2 = LEVELUP.itemPickupRadius * LEVELUP.itemPickupRadius;
          for (const item of groundRewards) {
            const dx = world.player.x - item.x;
            const dy = world.player.y - item.y;
            if (dx * dx + dy * dy <= pickupR2) {
              collectGroundReward(item);
              break;
            }
          }
        }
      }
      if (family === 'vfx' && booleanValue(state.values, ['loop'], true) && world.timeS >= nextVfxAt) {
        nextVfxAt = world.timeS + 1.25;
        triggerVfxPreset();
      }
    }
    const effects = selectedEffects();
    if (effects === 'effects-off' && world.fx) world.fx.length = 0;
    const visualDt = effects === 'low-motion' ? 0 : Math.min(frameS, 1 / 20) * effectiveRoomSpeed;
    const viewStart = performance.now();
    drawOverlays();
    view.update(visualDt);
    app.render();
    viewMs = performance.now() - viewStart;
    refreshMetrics();
  });

  const setPlaying = (playing: boolean): void => {
    state.playing = playing;
    liveAccumulator = 0;
    if (!engine) return;
    if (playing) {
      engine.releaseTransport();
      engine.clock.resume();
      engine.resumeContextIfAllowed();
    } else {
      engine.clock.pause();
      engine.holdTransport();
    }
  };

  return {
    initialState,
    capabilities: { play: true, step: true, speed: true, audio: true, overlays: true, reroll: true },
    async reset(next: DevFixture): Promise<void> {
      await rebuild(next);
    },
    serialize(): DevFixture {
      return cloneFixture(state);
    },
    setPlaying,
    step(): void {
      if (!world || rebuilding) return;
      world.update(SIM_DT);
      if (family === 'xp') presentNextReward();
      drawOverlays();
      view?.update(SIM_DT);
      app.render();
      refreshMetrics();
    },
    setSpeed(speed: number): void {
      state.speed = Math.max(0.25, Math.min(10, speed));
      applyEngineRate();
    },
    setAudio(audio: boolean): void {
      state.audio = audio;
      engine?.setMasterGain(effectiveAudio() ? 0.8 : 0);
      if (audio && state.playing) engine?.resumeContextIfAllowed();
    },
    setOverlays(overlays: boolean): void {
      state.overlays = overlays;
      if (overlayGfx) overlayGfx.visible = overlays;
      refreshMetrics();
    },
    reroll(): void {
      state.seed = (state.seed + 1) >>> 0;
      void rebuild();
    },
    async dispose(): Promise<void> {
      if (disposed) return;
      disposed = true;
      await bag.dispose();
      input.dispose();
      removeJoystick?.();
      removeJoystick = null;
      await disposeRuntime();
      app.destroy({ removeView: true }, { children: true });
      context.root.replaceChildren();
    },
  };
};
