// The game shell: Pixi app, run states, and the wiring between the music
// engine and the world. The engine stays a pure function of build and grid;
// the game only listens to its triggers and toggles voices on picks.

import { Application } from 'pixi.js';
import type { MusicEngine } from '../audio/engine';
import { TIER_COUNT } from '../audio/charts';
import { ROLES, type Kit, type Role } from '../audio/kits';
import { mountPlayground, type Playground } from '../rehearsal/playground';
import { RUN } from './config';
import { Hud, type PickOption } from './hud';
import { mountJoystick } from './joystick';
import { RunWorld } from './run';
import { mountSandboxPanel, type SandboxPanel } from './sandbox';

type State = 'start' | 'run' | 'pick' | 'end' | 'sandbox';

export async function bootGame(
  root: HTMLElement,
  engine: MusicEngine,
  kits: Map<Role, Kit>,
): Promise<void> {
  const app = new Application();
  await app.init({
    background: 0x101014,
    resizeTo: window,
    antialias: true,
    // crisp on phone screens; capped so high-dpr devices don't pay 3x pixels
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
  });
  root.appendChild(app.canvas);
  root.classList.add('game-root');
  // touch play: floating joystick on the arena; kill the long-press menu
  mountJoystick(root);
  root.addEventListener('contextmenu', (e) => e.preventDefault());

  const hud = new Hud(root, kits);
  let state: State = 'start';
  let world: RunWorld | null = null;
  let muted = false;

  // debug overlay
  const overlay = document.createElement('div');
  overlay.className = 'debug-overlay';
  overlay.style.display = 'none';
  root.appendChild(overlay);

  const events = {
    onLevelUp(level: number): void {
      void level;
      if (state !== 'run') return;
      // The pool (docs/phases/m2-the-arc.md): unowned weapons enter at tier
      // 1, owned ones offer their next tier, tier-4 weapons leave the pool.
      const pool: PickOption[] = [];
      for (const role of ROLES) {
        const tier = world!.tiers.get(role);
        if (!tier) pool.push({ role, tier: 1 });
        else if (tier < TIER_COUNT) pool.push({ role, tier: tier + 1 });
      }
      if (pool.length === 0) {
        world!.player.hp = Math.min(RUN.playerHp, world!.player.hp + 15);
        hud.showToast('+15 hp — the track is complete');
        return;
      }
      state = 'pick';
      engine.clock.pause();
      const options = shuffle(pool).slice(0, 3);
      hud.showPick(options, (option) => {
        state = 'run';
        // Musical entry rule: the clock resumes, the old chart finishes its
        // bar, and the new voice or tier enters on the following "1".
        const w = world;
        engine.atNextBar(() => {
          if (state !== 'run' || world !== w) return;
          engine.setVoiceTier(option.role, option.tier);
          engine.setVoiceEnabled(option.role, true);
          w!.addWeapon(option.role, option.tier);
          chartOverlay?.refresh();
        });
        engine.clock.resume();
      });
    },
    onDeath(): void {
      endRun(false);
    },
    onVictory(): void {
      endRun(true);
    },
    onHit(): void {
      hud.hitFlash();
    },
  };

  // Sandbox: same world, no stage script. Death just refills (the panel's
  // invulnerability toggle is the real control).
  const sandboxEvents = {
    onLevelUp(): void {},
    onDeath(): void {
      if (world) world.player.hp = RUN.playerHp;
      hud.showToast('you would have died — hp refilled');
    },
    onVictory(): void {},
    onHit(): void {
      hud.hitFlash();
    },
  };
  let sandboxPanel: SandboxPanel | null = null;

  function resetWorld(): void {
    sandboxPanel?.destroy();
    sandboxPanel = null;
    world?.destroy();
    world = null;
    engine.clearBarQueue();
    for (const role of ROLES) engine.setVoiceEnabled(role, false);
  }

  function startRun(startingKit: Role): void {
    resetWorld();
    world = new RunWorld(app.screen, events);
    app.stage.addChild(world.stage);
    engine.setVoiceTier(startingKit, 1);
    engine.setVoiceEnabled(startingKit, true);
    world.addWeapon(startingKit, 1);
    hud.showHud(true);
    state = 'run';
    void engine.ctx.resume();
    engine.clock.start();
  }

  function startSandbox(): void {
    resetWorld();
    world = new RunWorld(app.screen, sandboxEvents, { scripted: false });
    world.invincible = true;
    app.stage.addChild(world.stage);
    sandboxPanel = mountSandboxPanel(root, engine, world, () => {
      resetWorld();
      engine.clock.stop();
      hud.showHud(false);
      hud.showStart(startRun, startSandbox);
      state = 'start';
    });
    hud.showHud(true);
    state = 'sandbox';
    void engine.ctx.resume();
    engine.clock.start();
  }

  function endRun(victory: boolean): void {
    if (!world || state === 'end') return;
    state = 'end';
    engine.clock.stop();
    engine.clearBarQueue();
    const byWeapon = (Object.entries(world.killsByRole) as [Role, number][]).sort(
      (a, b) => b[1] - a[1],
    );
    hud.showEnd(
      victory,
      { timeS: world.timeS, kills: world.kills, level: world.level, byWeapon },
      () => {
        hud.showHud(false);
        hud.showStart(startRun, startSandbox);
        state = 'start';
      },
    );
  }

  // The read-only chart overlay (M2 dev tools): the playground component
  // mounted over the arena, showing the live engine state of the build.
  const chartOverlayEl = document.createElement('div');
  chartOverlayEl.className = 'chart-overlay';
  chartOverlayEl.style.display = 'none';
  root.appendChild(chartOverlayEl);
  let chartOverlay: Playground | null = null;
  function toggleChartOverlay(): void {
    const show = chartOverlayEl.style.display === 'none';
    chartOverlayEl.style.display = show ? '' : 'none';
    if (show) {
      chartOverlay ??= mountPlayground(chartOverlayEl, engine, { editable: false });
      chartOverlay.refresh();
    }
  }

  // one trigger, two outputs: the engine already made the sound; this makes
  // the damage.
  engine.addTriggerListener((t) => {
    if ((state === 'run' || state === 'sandbox') && world) world.fireTrigger(t);
  });

  app.ticker.add((ticker) => {
    engine.update();
    if ((state === 'run' || state === 'sandbox') && world) {
      const dt = Math.min(ticker.deltaMS / 1000, 1 / 20); // clamp long frames
      world.update(dt);
      hud.setStatus(
        world.player.hp / RUN.playerHp,
        world.xpProgress(),
        world.level,
        world.timeS,
      );
    }
    if (overlay.style.display !== 'none' && world) {
      const attribution = (Object.entries(world.killsByRole) as [Role, number][])
        .map(([r, k]) => `${r} ${k}`)
        .join(' ');
      overlay.textContent =
        `fps ${Math.round(ticker.FPS)} · enemies ${world.enemyCount} · ` +
        `shots ${world.projectileCount} · kills ${attribution || '—'}` +
        `${world.invincible ? ' · INVINCIBLE' : ''}${muted ? ' · MUTED' : ''}`;
    }
  });

  // debug controls: one set of actions behind both the hotkeys and the
  // on-screen buttons (docs/phases/m1-demo.md, developer tools)
  const debugActions = {
    mute: {
      label: 'mute',
      hotkey: 'M',
      isOn: () => muted,
      onClick: () => {
        muted = !muted;
        engine.setMasterGain(muted ? 0 : 0.8);
      },
    },
    invincible: {
      label: 'invincible',
      hotkey: 'I',
      isOn: () => world?.invincible ?? false,
      onClick: () => {
        if (world) world.invincible = !world.invincible;
      },
    },
    xp: {
      label: '+xp',
      hotkey: 'X',
      onClick: () => {
        if (world && state === 'run') world.grantXp(20);
      },
    },
    kill: {
      label: 'kill screen',
      hotkey: 'K',
      onClick: () => {
        if (world && (state === 'run' || state === 'sandbox')) world.killVisible();
      },
    },
    overlay: {
      label: 'overlay',
      hotkey: 'O',
      isOn: () => overlay.style.display !== 'none',
      onClick: () => {
        overlay.style.display = overlay.style.display === 'none' ? '' : 'none';
      },
    },
    charts: {
      label: 'charts',
      hotkey: 'C',
      isOn: () => chartOverlayEl.style.display !== 'none',
      onClick: toggleChartOverlay,
    },
  };
  hud.mountDebug(Object.values(debugActions));

  window.addEventListener('keydown', (e) => {
    const byKey: Record<string, { onClick(): void }> = {
      KeyM: debugActions.mute,
      KeyI: debugActions.invincible,
      KeyX: debugActions.xp,
      KeyK: debugActions.kill,
      KeyO: debugActions.overlay,
      KeyC: debugActions.charts,
    };
    const action = byKey[e.code];
    if (action) {
      action.onClick();
      hud.refreshDebug();
    }
  });

  hud.showStart(startRun, startSandbox);

  // extend the dev console handle
  Object.assign((window as unknown as { loop: object }).loop, {
    game: {
      get state() {
        return state;
      },
      get world() {
        return world;
      },
    },
  });
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
