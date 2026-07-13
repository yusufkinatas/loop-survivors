import { Application } from 'pixi.js';
import { BOSSES } from '../boss/bosses';
import { BossView } from '../boss/view';
import { BossWorld } from '../boss/world';
import { SIM_DT } from '../bot/conductor';
import { Input } from '../game/input';
import { mountJoystick } from '../game/joystick';
import { cloneFixture, type DevFixture } from './fixture';
import { DisposeBag } from './lifecycle';
import type { DevRoomSession, RoomMountContext } from './types';

type HazardId =
  | 'bullet'
  | 'ring'
  | 'spread'
  | 'shock'
  | 'ray'
  | 'vertical-lane'
  | 'horizontal-lane'
  | 'zone'
  | 'arc'
  | 'lunge'
  | 'all';

const HAZARDS: readonly { id: HazardId; label: string; api: string }[] = [
  { id: 'bullet', label: 'Aimed bullet', api: 'BossWorld.bullet' },
  { id: 'ring', label: 'Bullet ring', api: 'BossWorld.radial' },
  { id: 'spread', label: 'Aimed spread', api: 'BossWorld.aimedSpread' },
  { id: 'shock', label: 'Shockwave', api: 'BossWorld.shock' },
  { id: 'ray', label: 'Sweeping ray', api: "BossWorld.beam('ray')" },
  { id: 'vertical-lane', label: 'Vertical lane', api: "BossWorld.beam('vlane')" },
  { id: 'horizontal-lane', label: 'Horizontal lane', api: "BossWorld.beam('hlane')" },
  { id: 'zone', label: 'Warning field', api: 'BossWorld.zone' },
  { id: 'arc', label: 'Melee arc', api: 'BossWorld.arc' },
  { id: 'lunge', label: 'Boss lunge', api: 'BossWorld.bossLungeAt' },
  { id: 'all', label: 'Layer every API', api: 'all isolated APIs' },
];

function element<K extends keyof HTMLElementTagNameMap>(
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

function presetHazard(fixture: DevFixture): HazardId {
  const requested = fixture.values.hazard as HazardId | undefined;
  if (requested && HAZARDS.some(({ id }) => id === requested)) return requested;
  if (fixture.preset === 'telegraphed-field') return 'zone';
  if (fixture.preset === 'lunge') return 'arc';
  return 'ring';
}

/** A production-backed isolation harness for the experimental boss grammar.
 * It deliberately owns no conductor or song: each control calls the real
 * BossWorld API directly so warning, live, collision, and disposal behavior
 * can be judged without waiting for a complete arrangement. */
export async function mountBossHazardRoom(context: RoomMountContext): Promise<DevRoomSession> {
  const bag = new DisposeBag();
  const initialState = cloneFixture(context.fixture);
  let state = cloneFixture(context.fixture);
  let playing = state.playing;
  let speed = state.speed;
  let overlays = state.overlays;
  let disposed = false;
  let accumulator = 0;
  let lastFrame = performance.now();
  let dashQueued = false;
  let lastHazard = presetHazard(state);
  let hitCount = 0;

  const layout = element('div', 'dev-world-room', context.root);
  const controls = element('section', 'dev-room-controls', layout);
  const actions = element('div', 'dev-room-actions', controls);
  const note = element(
    'p',
    'dev-room-note',
    controls,
    'EXPERIMENTAL: this is the real BossWorld and BossView with no song conductor. Move with WASD/arrows or touch. Space/Dash tests dodge immunity. Each button clears the prior pattern so its warning and live shapes can be read alone.',
  );
  note.setAttribute('role', 'note');

  const stageWrap = element('div', 'dev-world-stage', layout);
  stageWrap.style.height = 'min(64vh, 680px)';
  stageWrap.style.minHeight = '420px';
  stageWrap.style.position = 'relative';
  const metrics = element('pre', 'dev-world-metrics', layout);
  metrics.setAttribute('aria-live', 'polite');

  const app = new Application();
  await app.init({
    width: 960,
    height: 600,
    background: 0x080a0f,
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

  const input = new Input();
  const removeJoystick = mountJoystick(stageWrap);
  const palette = BOSSES[0].palette;
  let world = makeWorld();
  let view = new BossView(world, palette);
  app.stage.addChild(view.stage);

  function makeWorld(): BossWorld {
    const created = new BossWorld(
      () => input.axis(),
      {
        onHit(): void { hitCount++; },
        onDeath(): void {},
      },
    );
    created.invincible = state.values.invincible !== '0';
    created.spawnBoss({
      color: palette.boss,
      radius: 44,
      behavior: 'anchor',
      homeX: 0,
      homeY: -150,
      x: 0,
      y: -150,
    });
    return created;
  }

  function clearHazards(): void {
    world.bullets.length = 0;
    world.shocks.length = 0;
    world.beams.length = 0;
    world.zones.length = 0;
    world.arcs.length = 0;
    world.fx.length = 0;
    world.boss.lungeT = 0;
    world.boss.x = 0;
    world.boss.y = -150;
    world.boss.homeX = 0;
    world.boss.homeY = -150;
  }

  function fire(id: HazardId, replace = true): void {
    if (replace) clearHazards();
    lastHazard = id;
    state.values.hazard = id;
    const b = world.boss;
    const p = world.player;
    switch (id) {
      case 'bullet':
        world.bullet({ x: b.x, y: b.y, angle: world.aimAt(b.x, b.y), speed: 285, radius: 9, damage: 10, color: palette.bullet });
        break;
      case 'ring':
        world.radial(b.x, b.y, 16, 230, { color: palette.bullet, offset: Math.PI / 16, radius: 8, damage: 9 });
        break;
      case 'spread':
        world.aimedSpread(b.x, b.y, 7, 1.05, 300, { color: palette.bullet, radius: 8, damage: 10 });
        break;
      case 'shock':
        world.shock({ x: b.x, y: b.y, rMax: 720, speed: 520, thickness: 34, warnT: 0.65, damage: 12, color: palette.beam });
        break;
      case 'ray':
        world.beam({ type: 'ray', ox: 0, oy: 0, angle: -0.4, sweepRate: 0.45, halfWidth: 28, warnT: 0.85, liveT: 1.8, damage: 14, color: palette.beam });
        break;
      case 'vertical-lane':
        world.beam({ type: 'vlane', ox: p.x, oy: 0, halfWidth: 48, warnT: 0.85, liveT: 0.7, damage: 14, color: palette.accent });
        break;
      case 'horizontal-lane':
        world.beam({ type: 'hlane', ox: 0, oy: p.y, halfWidth: 48, warnT: 0.85, liveT: 0.7, damage: 14, color: palette.accent });
        break;
      case 'zone':
        world.zone({ x: p.x, y: p.y, radius: 112, warnT: 0.9, liveT: 0.55, damage: 14, color: palette.accent });
        break;
      case 'arc':
        world.arc({ cx: b.x, cy: b.y, angle: world.aimAt(b.x, b.y), half: Math.PI / 2.7, reach: 250, warnT: 0.75, liveT: 0.4, damage: 14, color: palette.beam });
        break;
      case 'lunge':
        world.pulseBoss(1);
        world.bossLungeAt(p.x, p.y, 720, 0.45);
        break;
      case 'all':
        for (const hazard of HAZARDS) {
          if (hazard.id !== 'all' && hazard.id !== 'lunge') fire(hazard.id, false);
        }
        lastHazard = 'all';
        state.values.hazard = 'all';
        break;
    }
    refresh();
  }

  function rebuild(next: DevFixture): void {
    state = cloneFixture(next);
    playing = state.playing;
    speed = Math.max(0.25, Math.min(10, state.speed));
    overlays = state.overlays;
    hitCount = 0;
    accumulator = 0;
    app.stage.removeChild(view.stage);
    view.destroy();
    world = makeWorld();
    view = new BossView(world, palette);
    app.stage.addChild(view.stage);
    fire(presetHazard(state));
  }

  for (const hazard of HAZARDS) {
    const trigger = element('button', 'dev-button', actions, hazard.label);
    trigger.type = 'button';
    trigger.title = hazard.api;
    trigger.onclick = () => fire(hazard.id);
  }
  const dash = element('button', 'dev-button', actions, 'Dash');
  dash.type = 'button';
  dash.onclick = () => { dashQueued = true; };
  const invincible = element('button', 'dev-button', actions, world.invincible ? 'Invincible: on' : 'Invincible: off');
  invincible.type = 'button';
  invincible.onclick = () => {
    world.invincible = !world.invincible;
    state.values.invincible = world.invincible ? '1' : '0';
    invincible.textContent = `Invincible: ${world.invincible ? 'on' : 'off'}`;
    refresh();
  };
  const phaseReset = element('button', 'dev-button', actions, 'Reset phase fixture');
  phaseReset.type = 'button';
  phaseReset.onclick = () => rebuild(state);

  bag.listen(window, 'keydown', (event: KeyboardEvent) => {
    if (event.code !== 'Space' || event.repeat) return;
    event.preventDefault();
    dashQueued = true;
  });

  const resize = (): void => {
    const rect = stageWrap.getBoundingClientRect();
    app.renderer.resize(Math.max(320, Math.round(rect.width || 960)), Math.max(320, Math.round(rect.height || 600)));
  };
  const observer = new ResizeObserver(resize);
  observer.observe(stageWrap);
  bag.add(() => observer.disconnect());
  resize();

  function tick(dt: number): void {
    world.update(dt, dashQueued);
    dashQueued = false;
  }

  function refresh(): void {
    view.update(0, app.screen.width, app.screen.height);
    metrics.hidden = !overlays;
    metrics.textContent = [
      'EXPERIMENTAL — not integrated into the normal run',
      `fixture       ${lastHazard}`,
      `real API      ${HAZARDS.find(({ id }) => id === lastHazard)?.api ?? lastHazard}`,
      `time          ${world.timeS.toFixed(2)} s`,
      `player HP     ${world.player.hp.toFixed(0)} / ${world.player.maxHp}`,
      `invincible    ${world.invincible ? 'yes' : 'no'}`,
      `hits observed ${hitCount}`,
      `bullets       ${world.bullets.length}`,
      `shockwaves    ${world.shocks.length}`,
      `beams/lanes   ${world.beams.length}`,
      `fields        ${world.zones.length}`,
      `melee arcs    ${world.arcs.length}`,
      '',
      'Lifecycle ownership: Pixi app + BossView + BossWorld + Input + touch joystick + RAF.',
    ].join('\n');
    app.render();
  }

  bag.animationFrame((now) => {
    const elapsed = Math.min(0.1, Math.max(0, (now - lastFrame) / 1000));
    lastFrame = now;
    if (playing) {
      accumulator += elapsed * speed;
      while (accumulator >= SIM_DT) {
        tick(SIM_DT);
        accumulator -= SIM_DT;
      }
    }
    view.update(playing ? elapsed : 0, app.screen.width, app.screen.height);
    refresh();
  });

  fire(lastHazard);

  return {
    initialState,
    capabilities: { play: true, step: true, speed: true, overlays: true },
    reset(next): void { rebuild(next); },
    serialize(): DevFixture { return cloneFixture(state); },
    setPlaying(next): void { playing = next; state.playing = next; },
    step(): void { tick(SIM_DT); refresh(); },
    setSpeed(next): void { speed = Math.max(0.25, Math.min(10, next)); state.speed = speed; },
    setOverlays(next): void { overlays = next; state.overlays = next; refresh(); },
    reroll(): void { fire(lastHazard); },
    async dispose(): Promise<void> {
      if (disposed) return;
      disposed = true;
      await bag.dispose();
      input.dispose();
      removeJoystick();
      app.stage.removeChild(view.stage);
      view.destroy();
      app.destroy({ removeView: true }, { children: true });
      context.root.replaceChildren();
    },
  };
}
