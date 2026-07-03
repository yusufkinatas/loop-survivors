// The game shell: Pixi app, run states, and the wiring between the music
// engine and the world. The engine stays a pure function of build and grid;
// the game only listens to its triggers and toggles voices on picks.

import { Application } from 'pixi.js';
import type { MusicEngine } from '../audio/engine';
import { ROLES, type Kit, type Role } from '../audio/kits';
import { RUN } from './config';
import { Hud } from './hud';
import { RunWorld } from './run';

type State = 'start' | 'run' | 'pick' | 'end';

export async function bootGame(
  root: HTMLElement,
  engine: MusicEngine,
  kits: Map<Role, Kit>,
): Promise<void> {
  const app = new Application();
  await app.init({ background: 0x101014, resizeTo: window, antialias: true });
  root.appendChild(app.canvas);
  root.classList.add('game-root');

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
      const unowned = ROLES.filter((r) => !world!.owned.has(r));
      if (unowned.length === 0) {
        world!.player.hp = Math.min(RUN.playerHp, world!.player.hp + 15);
        hud.showToast('+15 hp — the band is complete');
        return;
      }
      state = 'pick';
      engine.clock.pause();
      const options = shuffle(unowned).slice(0, 3);
      hud.showPick(options, (role) => {
        engine.setVoiceEnabled(role, true);
        world!.addWeapon(role);
        state = 'run';
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

  function startRun(startingKit: Role): void {
    world?.destroy();
    for (const role of ROLES) engine.setVoiceEnabled(role, false);
    world = new RunWorld(app.screen, events);
    app.stage.addChild(world.stage);
    engine.setVoiceEnabled(startingKit, true);
    world.addWeapon(startingKit);
    hud.showHud(true);
    state = 'run';
    void engine.ctx.resume();
    engine.clock.start();
  }

  function endRun(victory: boolean): void {
    if (!world || state === 'end') return;
    state = 'end';
    engine.clock.stop();
    const byWeapon = (Object.entries(world.killsByRole) as [Role, number][]).sort(
      (a, b) => b[1] - a[1],
    );
    hud.showEnd(
      victory,
      { timeS: world.timeS, kills: world.kills, level: world.level, byWeapon },
      () => {
        hud.showHud(false);
        hud.showStart(startRun);
        state = 'start';
      },
    );
  }

  // one trigger, two outputs: the engine already made the sound; this makes
  // the damage.
  engine.addTriggerListener((t) => {
    if (state === 'run' && world) world.fireTrigger(t);
  });

  app.ticker.add((ticker) => {
    engine.update();
    if (state === 'run' && world) {
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
        if (world && state === 'run') world.killVisible();
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
  };
  hud.mountDebug(Object.values(debugActions));

  window.addEventListener('keydown', (e) => {
    const byKey: Record<string, { onClick(): void }> = {
      KeyM: debugActions.mute,
      KeyI: debugActions.invincible,
      KeyX: debugActions.xp,
      KeyK: debugActions.kill,
      KeyO: debugActions.overlay,
    };
    const action = byKey[e.code];
    if (action) {
      action.onClick();
      hud.refreshDebug();
    }
  });

  hud.showStart(startRun);

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
