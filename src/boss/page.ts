// The Boss Fight page (#boss). Pick a boss, then fight it. The boss makes the
// music and the whole track is the fight: you have no weapons, only movement
// and a dodge dash, and you win by surviving until the song ends (the boss's
// "health" bar is really the song draining away). Three bosses, three
// completely different survival problems — see bosses.ts.

import { Application } from 'pixi.js';
import { LabEngine } from '../tracklab/labengine';
import { Input } from '../game/input';
import { mountJoystick } from '../game/joystick';
import { BossConductor } from './conductor';
import { BOSSES, type BossDef } from './bosses';
import { ARENA, BossWorld } from './world';
import { BossView } from './view';

type State = 'select' | 'loading' | 'fight' | 'end';

function el(tag: string, className: string, parent: HTMLElement, text = ''): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  parent.appendChild(node);
  return node;
}

function fmtTime(s: number): string {
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

export async function mountBossFight(root: HTMLElement, ctx: AudioContext): Promise<void> {
  root.innerHTML = '';
  root.classList.add('game-root');
  root.addEventListener('contextmenu', (e) => e.preventDefault());

  const app = new Application();
  await app.init({
    background: 0x0c0c12,
    resizeTo: window,
    antialias: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
  });
  root.appendChild(app.canvas);
  mountJoystick(root);

  const input = new Input();
  let state: State = 'select';
  let def: BossDef | null = null;
  let labEngine: LabEngine | null = null;
  let conductor: BossConductor | null = null;
  let world: BossWorld | null = null;
  let view: BossView | null = null;
  let muted = false;
  let invincible = false;
  let dashQueued = false;

  // ---- HUD (built once, shown during the fight) ----
  const hud = el('div', 'boss-hud', root);
  hud.style.display = 'none';
  const topbar = el('div', 'boss-topbar', hud);
  const bossName = el('div', 'boss-name', topbar, '');
  const healthTrack = el('div', 'boss-health', topbar);
  const healthFill = el('div', 'fill', healthTrack);
  const phaseLabel = el('div', 'boss-phase', topbar, '');
  const playerBar = el('div', 'boss-playerbar', hud);
  el('span', 'lbl', playerBar, 'YOU');
  const hpTrack = el('div', 'meter hp', playerBar);
  const hpFill = el('div', 'fill', hpTrack);

  const controls = el('div', 'boss-controls', root);
  controls.style.display = 'none';
  const backBtn = el('button', 'small', controls, '‹ bosses') as HTMLButtonElement;
  backBtn.onclick = () => toSelect();
  const dashBtn = el('button', 'small boss-dash', controls, 'DASH') as HTMLButtonElement;
  dashBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (state === 'fight') dashQueued = true;
  });
  const invBtn = el('button', 'small', controls, 'invincible') as HTMLButtonElement;
  invBtn.onclick = () => {
    invincible = !invincible;
    if (world) world.invincible = invincible;
    invBtn.classList.toggle('on', invincible);
    invBtn.blur();
  };
  const muteBtn = el('button', 'small', controls, 'mute') as HTMLButtonElement;
  muteBtn.onclick = () => {
    muted = !muted;
    labEngine?.setMasterGain(muted ? 0 : 0.85);
    muteBtn.classList.toggle('on', muted);
    muteBtn.blur();
  };

  const flash = el('div', 'hit-flash', root);
  let screen: HTMLElement | null = null;
  const newScreen = (): HTMLElement => {
    screen?.remove();
    screen = el('div', 'screen boss-screen', root);
    return screen;
  };
  const closeScreen = (): void => {
    screen?.remove();
    screen = null;
  };

  function teardownFight(): void {
    conductor?.stop();
    labEngine?.dispose();
    if (view) {
      app.stage.removeChild(view.stage);
      view.destroy();
    }
    conductor = null;
    labEngine = null;
    world = null;
    view = null;
  }

  function toSelect(): void {
    teardownFight();
    state = 'select';
    def = null;
    hud.style.display = 'none';
    controls.style.display = 'none';
    app.renderer.background.color = 0x0c0c12;
    showSelect();
  }

  function showSelect(): void {
    const s = newScreen();
    el('h1', '', s, 'Boss Fights');
    el(
      'p',
      'sub',
      s,
      'No weapons here. The boss makes the music, and the whole track is the fight — survive to the last bar and it falls. Move with WASD / arrows or the joystick; dash with Space or Shift.',
    );
    const grid = el('div', 'boss-select', s);
    for (const b of BOSSES) {
      const card = el('button', 'boss-card', grid) as HTMLButtonElement;
      card.style.setProperty('--boss-color', `#${b.palette.boss.toString(16).padStart(6, '0')}`);
      el('span', 'boss-card-arch', card, b.archetype);
      el('span', 'boss-card-name', card, b.name);
      el('span', 'boss-card-artist', card, `${b.track.artist} · ${b.track.bpm} bpm`);
      el('span', 'boss-card-tag', card, b.tagline);
      card.onclick = () => void startBoss(b);
    }
    const row = el('div', 'boss-select-foot', s);
    const gameBtn = el('button', 'small', row, '‹ back to game') as HTMLButtonElement;
    gameBtn.onclick = () => {
      location.hash = '';
    };
  }

  async function startBoss(chosen: BossDef): Promise<void> {
    teardownFight();
    def = chosen;
    state = 'loading';
    const s = newScreen();
    el('h2', '', s, `Summoning ${chosen.name}…`);
    el('p', 'sub', s, 'building instruments');

    let engine: LabEngine;
    try {
      engine = await LabEngine.load(ctx, chosen.track);
    } catch (err) {
      const es = newScreen();
      el('h2', '', es, 'Failed to summon');
      el('p', 'sub', es, err instanceof Error ? err.message : String(err));
      const b = el('button', 'big', es, 'back') as HTMLButtonElement;
      b.onclick = () => toSelect();
      return;
    }
    // Bail if the player navigated away while instruments built.
    if (def !== chosen) {
      engine.dispose();
      return;
    }
    labEngine = engine;

    world = new BossWorld(() => input.axis(), {
      onHit: () => {
        flash.classList.remove('on');
        void flash.offsetWidth;
        flash.classList.add('on');
      },
      onDeath: () => endFight(false),
    });
    world.invincible = invincible;
    const bx = chosen.spawn.x * ARENA.w;
    const by = chosen.spawn.y * ARENA.h;
    world.spawnBoss({
      x: bx,
      y: by,
      homeX: bx,
      homeY: by,
      radius: chosen.bossRadius,
      color: chosen.palette.boss,
      behavior: chosen.behavior,
      chaseSpeed: chosen.chaseSpeed,
      contactDamage: chosen.contactDamage,
    });

    view = new BossView(world, chosen.palette);
    app.stage.addChild(view.stage);
    app.renderer.background.color = chosen.palette.bg;

    const w = world;
    const d = chosen;
    conductor = new BossConductor(labEngine, chosen.arrangement, {
      onStep: (info) => d.onStep(info, w),
      onSectionEnter: (id, i) => {
        d.onSectionEnter?.(id, i, w);
        phaseLabel.textContent = `${i + 1}/${d.arrangement.length} · ${conductor!.sectionName(id)}`;
      },
      onFinish: () => endFight(true),
    });

    // seed the first phase so section-0 behavior is set before the first beat
    d.onSectionEnter?.(chosen.arrangement[0].sectionId, 0, w);

    bossName.textContent = chosen.name;
    phaseLabel.textContent = '';
    healthFill.style.width = '100%';
    hpFill.style.width = '100%';
    hud.style.display = '';
    controls.style.display = '';
    invBtn.classList.toggle('on', invincible);
    muteBtn.classList.toggle('on', muted);
    closeScreen();
    state = 'fight';
    labEngine.setMasterGain(muted ? 0 : 0.85);
    conductor.start();
  }

  function endFight(victory: boolean): void {
    if (state !== 'fight' || !world || !def) return;
    state = 'end';
    world.frozen = true;
    conductor?.stop();
    hud.style.display = 'none';
    controls.style.display = 'none';
    const finishedDef = def;
    const s = newScreen();
    el('h1', '', s, victory ? 'You survived.' : 'Down.');
    el(
      'p',
      'sub',
      s,
      victory
        ? `${finishedDef.name} played its last bar. You outlasted the whole track.`
        : `${finishedDef.name} got you at ${fmtTime(world.timeS)} of ${fmtTime(conductor?.durationS ?? 0)}.`,
    );
    const row = el('div', 'boss-select-foot', s);
    const again = el('button', 'big', row, 'fight again') as HTMLButtonElement;
    again.onclick = () => void startBoss(finishedDef);
    const pick = el('button', 'small', row, 'choose boss') as HTMLButtonElement;
    pick.onclick = () => toSelect();
    const gameBtn = el('button', 'small', row, 'back to game') as HTMLButtonElement;
    gameBtn.onclick = () => {
      location.hash = '';
    };
  }

  // dash on Space / Shift (kept out of screens so buttons still work)
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
      if (state === 'fight') {
        dashQueued = true;
        e.preventDefault();
      }
    }
  });

  app.ticker.add((ticker) => {
    if (state === 'fight' && world && view && labEngine && conductor) {
      labEngine.update();
      // Drain beat events at audio time (spawns this frame's attacks) before
      // the world steps, so new hazards move on the same frame they appear.
      conductor.update(labEngine.ctx.currentTime);
      const dt = Math.min(ticker.deltaMS / 1000, 1 / 20);
      const dash = dashQueued;
      dashQueued = false;
      world.update(dt, dash);
      view.update(dt, app.screen.width, app.screen.height);
      hpFill.style.width = `${Math.max(0, (world.player.hp / world.player.maxHp) * 100)}%`;
      if (conductor) healthFill.style.width = `${Math.max(0, (1 - conductor.progress01()) * 100)}%`;
    } else if (state === 'end' && world && view) {
      // keep the last frame alive (frozen sim) so the arena doesn't blank out
      view.update(Math.min(ticker.deltaMS / 1000, 1 / 20), app.screen.width, app.screen.height);
    }
  });

  // console handle for probing
  const gw = window as unknown as { loop?: Record<string, unknown> };
  if (gw.loop) {
    gw.loop.boss = {
      get world() {
        return world;
      },
      get conductor() {
        return conductor;
      },
      bosses: BOSSES,
      fight: (id: string) => {
        const b = BOSSES.find((x) => x.id === id);
        if (b) void startBoss(b);
      },
    };
  }

  showSelect();
}
