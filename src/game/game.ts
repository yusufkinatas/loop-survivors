// The game shell: Pixi app, run states, and the wiring between the music
// engine and the world. The engine stays a pure function of build and grid;
// the game only listens to its triggers and toggles voices on picks.

import { Application } from 'pixi.js';
import type { MusicEngine } from '../audio/engine';
import { ROLES, type Kit, type Role } from '../audio/kits';
import { SIM_DT, VirtualConductor } from '../bot/conductor';
import { MOVERS, type MoverName } from '../bot/movers';
import { makePolicy } from '../bot/policies';
import { SIM_VIEW } from '../bot/sim';
import { mountPlayground, type Playground } from '../rehearsal/playground';
import { RUN } from './config';
import { Hud, TIER_NUMERALS } from './hud';
import { Input } from './input';
import { mountJoystick } from './joystick';
import { buildPickPool, shuffleWith } from './picks';
import { mulberry32 } from './rng';
import { RunWorld } from './run';
import { RunView } from './view';
import { mountSandboxPanel, type SandboxPanel } from './sandbox';

type State = 'start' | 'run' | 'pick' | 'end' | 'sandbox' | 'replay';

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
  const input = new Input();
  let state: State = 'start';
  let world: RunWorld | null = null;
  let view: RunView | null = null;
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
      // The pool (docs/phases/m2-the-arc.md) is shared with the autoplay
      // bot via picks.ts, so the bot faces the exact offers a player does.
      const pool = buildPickPool(world!.tiers);
      if (pool.length === 0) {
        world!.player.hp = Math.min(RUN.playerHp, world!.player.hp + 15);
        hud.showToast('+15 hp — the track is complete');
        return;
      }
      state = 'pick';
      engine.clock.pause();
      const options = shuffleWith(pool, Math.random).slice(0, 3);
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
  let replayConductor: VirtualConductor | null = null;
  let replayAcc = 0;
  let replaySpeed = 1;

  // Replay speed control: multiplies how much simulated time each frame
  // pays out. The fixed-dt step sequence is untouched, so speed never
  // breaks a replay's tick-identity with its batch run. Above 1x the
  // audio mutes: the sound clock is real time and cannot be sped up.
  const REPLAY_SPEEDS = [1, 2, 5, 10];
  const speedRow = document.createElement('div');
  speedRow.className = 'replay-speed';
  speedRow.style.display = 'none';
  root.appendChild(speedRow);

  // Replay seek: a replay is a simulation, not a video, so seeking means
  // computing. Forward: fast-forward at uncapped speed (budgeted per frame
  // so the page stays alive). Backward: restart from the seed — determinism
  // guarantees the identical run — then fast-forward to the target.
  let replayTarget: number | null = null;
  let lastReplay: { seed: number; mover: MoverName; policy: string } | null = null;
  const seekRow = document.createElement('div');
  seekRow.className = 'replay-seek';
  seekRow.style.display = 'none';
  const seekSlider = document.createElement('input');
  seekSlider.type = 'range';
  seekSlider.min = '0';
  seekSlider.max = String(RUN.durationS);
  seekSlider.step = '15';
  seekSlider.value = '0';
  const seekLabel = document.createElement('span');
  seekLabel.textContent = '0:00';
  seekRow.append(seekSlider, seekLabel);
  root.appendChild(seekRow);
  let seekDragging = false;
  seekSlider.addEventListener('pointerdown', () => {
    seekDragging = true;
  });
  seekSlider.addEventListener('input', () => {
    seekLabel.textContent = fmtTime(Number(seekSlider.value));
  });
  seekSlider.addEventListener('change', () => {
    seekDragging = false;
    seekTo(Number(seekSlider.value));
    seekSlider.blur(); // keep arrow keys for the game
  });

  function seekTo(targetS: number): void {
    if (!lastReplay) return;
    if (state !== 'replay' || !world || targetS < world.timeS) {
      const r = lastReplay;
      startReplay(r.seed, r.mover, r.policy);
    }
    replayTarget = targetS;
    applyGain();
  }

  function applyGain(): void {
    engine.setMasterGain(muted || replaySpeed > 1 || replayTarget !== null ? 0 : 0.8);
  }
  function setReplaySpeed(mult: number): void {
    replaySpeed = mult;
    applyGain();
    for (const [i, btn] of [...speedRow.children].entries()) {
      btn.classList.toggle('on', REPLAY_SPEEDS[i] === mult);
    }
  }
  for (const mult of REPLAY_SPEEDS) {
    const btn = document.createElement('button');
    btn.className = 'small debug-btn';
    btn.textContent = `${mult}x`;
    btn.onclick = () => {
      setReplaySpeed(mult);
      btn.blur();
    };
    speedRow.appendChild(btn);
  }

  function resetWorld(): void {
    sandboxPanel?.destroy();
    sandboxPanel = null;
    view?.destroy();
    view = null;
    world = null;
    replayConductor = null;
    replayAcc = 0;
    engine.clearBarQueue();
    for (const role of ROLES) engine.setVoiceEnabled(role, false);
  }

  function startRun(startingKit: Role): void {
    resetWorld();
    world = new RunWorld(app.screen, events, { control: () => input.axis() });
    view = new RunView(world, app.screen);
    app.stage.addChild(view.stage);
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
    world = new RunWorld(app.screen, sandboxEvents, {
      scripted: false,
      control: () => input.axis(),
    });
    world.invincible = true;
    view = new RunView(world, app.screen);
    app.stage.addChild(view.stage);
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

  /** Bot replay (docs/tools/autoplay-bot.md): re-run a batch seed live and
   *  watchable. The world runs at the sim's fixed dimensions and fixed
   *  60 Hz ticks under the seeded RNG, so it is tick-identical to the
   *  headless run; the view and the engine's sound ride along. */
  function startReplay(seed: number, moverName: MoverName, policySpec: string): void {
    resetWorld();
    replayTarget = null;
    lastReplay = { seed, mover: moverName, policy: policySpec };
    const rng = mulberry32(seed);
    const policy = makePolicy(policySpec);
    const mover = MOVERS[moverName] ?? MOVERS.kiter;
    const replayEvents = {
      onLevelUp(): void {
        replayConductor?.onLevelUp();
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
    const w: RunWorld = new RunWorld(SIM_VIEW, replayEvents, { rng, control: () => mover(w) });
    world = w;
    replayConductor = new VirtualConductor(w, policy.choose, rng, {
      onPick(option) {
        const kit = kits.get(option.role)!;
        hud.showToast(`bot picks ${kit.name} ${TIER_NUMERALS[option.tier - 1]}`);
      },
      onApply(option) {
        // the sound mirrors the sim's build; gameplay is driven by the
        // virtual clock, the engine only plays along
        engine.setVoiceTier(option.role, option.tier);
        engine.setVoiceEnabled(option.role, true);
        chartOverlay?.refresh();
      },
      onHeal() {
        hud.showToast('+15 hp — the track is complete');
      },
    });
    view = new RunView(w, app.screen);
    app.stage.addChild(view.stage);
    hud.showHud(true);
    hud.showToast(`replaying seed ${seed} (${moverName}/${policySpec})`);
    speedRow.style.display = '';
    seekRow.style.display = '';
    seekSlider.value = '0';
    seekLabel.textContent = '0:00';
    setReplaySpeed(1);
    state = 'replay';
    void engine.ctx.resume();
    engine.clock.start();
    replayConductor.start(policy.startingKit(rng));
  }

  function endRun(victory: boolean): void {
    if (!world || state === 'end') return;
    state = 'end';
    speedRow.style.display = 'none';
    seekRow.style.display = 'none';
    replaySpeed = 1;
    replayTarget = null;
    applyGain();
    engine.clock.stop();
    engine.clearBarQueue();
    hud.showEnd(
      victory,
      {
        timeS: world.timeS,
        kills: world.kills,
        level: world.level,
        damageByRole: world.damageByRole,
        killsByRole: world.killsByRole,
      },
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
      view?.update(dt);
      hud.setStatus(
        world.player.hp / RUN.playerHp,
        world.xpProgress(),
        world.level,
        world.timeS,
      );
    } else if (state === 'replay' && world && replayConductor) {
      if (replayTarget !== null) {
        // seeking: step flat out inside a per-frame time budget so the
        // page stays responsive while the sim catches up to the target
        const deadline = performance.now() + 24;
        while (
          state === 'replay' &&
          world.timeS < replayTarget &&
          performance.now() < deadline
        ) {
          replayConductor.tick(SIM_DT);
          world.update(SIM_DT);
        }
        if (state === 'replay' && world.timeS >= replayTarget) {
          replayTarget = null;
          replayAcc = 0;
          applyGain();
        }
      } else {
        // fixed 60 Hz sub-steps: only fixed ticks reproduce the batch run.
        // replaySpeed pays out more simulated time per frame; the step cap
        // keeps heavy frames responsive (the replay just falls behind the
        // requested speed instead of freezing the page).
        replayAcc += Math.min(ticker.deltaMS / 1000, 1 / 20) * replaySpeed;
        let steps = 0;
        while (replayAcc >= SIM_DT && steps < 12 && state === 'replay') {
          replayAcc -= SIM_DT;
          steps++;
          replayConductor.tick(SIM_DT);
          world.update(SIM_DT);
        }
        if (replayAcc > SIM_DT * 12) replayAcc = SIM_DT * 12; // don't bank a backlog
      }
      if (state === 'replay') {
        view?.update((ticker.deltaMS / 1000) * replaySpeed);
        hud.setStatus(
          world.player.hp / RUN.playerHp,
          world.xpProgress(),
          world.level,
          world.timeS,
        );
        if (!seekDragging) {
          seekSlider.value = String(Math.floor(world.timeS));
          seekLabel.textContent = fmtTime(world.timeS);
        }
      }
    }
    if (overlay.style.display !== 'none' && world) {
      // damage share, not kills: the primary attribution metric
      const byDamage = Object.entries(world.damageByRole) as [Role, number][];
      const total = byDamage.reduce((sum, [, dmg]) => sum + dmg, 0);
      const attribution = byDamage
        .sort((a, b) => b[1] - a[1])
        .map(([r, dmg]) => `${r} ${Math.round((dmg / (total || 1)) * 100)}%`)
        .join(' ');
      overlay.textContent =
        `fps ${Math.round(ticker.FPS)} · enemies ${world.enemyCount} · ` +
        `shots ${world.projectileCount} · dmg ${attribution || '—'}` +
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
        applyGain();
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
      label: 'level up',
      hotkey: 'X',
      onClick: () => {
        if (world && state === 'run') world.levelUp();
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

  function fmtTime(s: number): string {
    return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  }

  // ?replay=<seed>&mover=<mover>&policy=<policy> boots straight into a bot
  // replay (the batch report prints these links for its outliers)
  const params = new URLSearchParams(location.search);
  const replaySeed = params.get('replay');
  if (replaySeed !== null) {
    startReplay(
      Number(replaySeed),
      (params.get('mover') ?? 'kiter') as MoverName,
      params.get('policy') ?? 'random',
    );
  } else {
    hud.showStart(startRun, startSandbox);
  }

  // extend the dev console handle
  Object.assign((window as unknown as { loop: object }).loop, {
    game: {
      app,
      get state() {
        return state;
      },
      get world() {
        return world;
      },
    },
  });
}

