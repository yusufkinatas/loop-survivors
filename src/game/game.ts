// The game shell: Pixi app, run states, and the wiring between the music
// engine and the world. The engine stays a pure function of build and grid;
// the game only listens to its triggers and toggles voices on picks.

import { Application } from 'pixi.js';
import type { MusicEngine } from '../audio/engine';
import { activeGenre } from '../audio/chartstore';
import { GENRES, GENRE_BY_ID, DEFAULT_GENRE, type Genre, type GenreId } from '../audio/genres';
import { ROLES, type Kit, type Role } from '../audio/kits';
import { SIM_DT, VirtualConductor } from '../bot/conductor';
import { MOVERS, type MoverName } from '../bot/movers';
import { makePolicy } from '../bot/policies';
import { SIM_VIEW } from '../bot/sim';
import { mountPlayground, type Playground } from '../rehearsal/playground';
import { RUN } from './config';
import { EFFECT_META } from './effects';
import { Hud, TIER_NUMERALS } from './hud';
import { ConductedGrid } from './hype';
import { Input } from './input';
import { ITEMS } from './items';
import { mountJoystick } from './joystick';
import { rollOffers, type PickOption } from './picks';
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
    background: 0x0a0b0f,
    resizeTo: window,
    antialias: true,
    // crisp on phone screens; capped so high-dpr devices don't pay 3x pixels
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
  });
  root.appendChild(app.canvas);
  root.classList.add('game-root');
  // Camera-independent arena darkening: a DOM vignette above the canvas but
  // below the HUD/screens/toasts (which own z-index >= 2).
  const arenaVignette = document.createElement('div');
  arenaVignette.className = 'arena-vignette';
  root.appendChild(arenaVignette);
  // touch play: floating joystick on the arena; kill the long-press menu
  mountJoystick(root);
  root.addEventListener('contextmenu', (e) => e.preventDefault());

  const hud = new Hud(root, kits);
  const input = new Input();
  // The Conducted Grid (Hype Layer v2, see src/game/hype.ts): the run's live
  // arrangement dynamics. Its DOM panel mounts once; it reads world state to
  // derive combat intensity and drives the engine (per-voice filtering + the
  // Drop's gating/overdrive) only while a run/sandbox is live. The engine's
  // bar-boundary callback is its phrase clock.
  const hype = new ConductedGrid();
  hype.mount(root);
  hype.onPeak = () => {
    if (!world) return;
    // The Drop payoff: a bright flash + a HUD pulse the instant the whole band
    // slams back in on the downbeat.
    world.fx?.push({ type: 'flash', color: 0xffd76b, alpha: 0.22, dur: 0.26 });
    hud.levelPulse();
  };
  engine.addBarListener((bar) => hype.onBar(bar));
  let state: State = 'start';
  let world: RunWorld | null = null;
  let view: RunView | null = null;
  let muted = false;
  let paused = false;

  // Pause overlay: ESC freezes the run behind a dimmed screen; the audio clock
  // stops so no triggers fire, and the game loop skips its world step. A second
  // ESC resumes. Only the live run pauses — menus and replays have their own
  // controls (the replay has speed/seek).
  const pauseOverlay = document.createElement('div');
  pauseOverlay.className = 'pause-overlay';
  pauseOverlay.style.display = 'none';
  pauseOverlay.innerHTML =
    '<h1>Paused</h1><div class="pause-rack"></div><p class="hint">Hit ESC again to continue.</p>';
  root.appendChild(pauseOverlay);
  const pauseRack = pauseOverlay.querySelector('.pause-rack') as HTMLElement;
  function togglePause(): void {
    if (state !== 'run') return;
    paused = !paused;
    pauseOverlay.style.display = paused ? '' : 'none';
    if (paused) {
      engine.clock.pause();
      // Show the current band while paused (the same rack the HUD draws).
      if (world) hud.renderBand(world.tiers, pauseRack);
    } else engine.clock.resume();
  }

  // debug overlay
  const overlay = document.createElement('div');
  overlay.className = 'debug-overlay';
  overlay.style.display = 'none';
  root.appendChild(overlay);

  const events = {
    onLevelUp(level: number): void {
      void level;
      if (state !== 'run') return;
      // The offer roll (docs/phases/m2-the-arc.md) is shared with the autoplay
      // bot via picks.ts, so the bot faces the exact offers a player does.
      const options = rollOffers(
        world!.tiers,
        world!.items,
        world!.effects,
        Math.random,
        activeGenre().id,
        world!.timeS,
      );
      if (options.length === 0) {
        world!.player.hp = Math.min(RUN.playerHp, world!.player.hp + 15);
        hud.showToast('+15 hp — the track is complete');
        return;
      }
      state = 'pick';
      engine.clock.pause();
      hud.showPick(options, (option) => {
        state = 'run';
        // Musical entry rule: the clock resumes, the old chart finishes its
        // bar, and the new voice / tier / item / effect enters on the next "1".
        const w = world;
        engine.atNextBar(() => {
          if (state !== 'run' || world !== w) return;
          if (option.kind === 'weapon') {
            engine.setVoiceTier(option.role, option.tier);
            engine.setVoiceEnabled(option.role, true);
            w!.addWeapon(option.role, option.tier);
          } else if (option.kind === 'item') {
            w!.addItem(option.item, option.level);
          } else {
            w!.attachEffect(option.role, option.effect);
            engine.setVoiceEffect(option.role, option.effect);
          }
          hud.renderItems(w!.items);
          hud.renderBand(w!.tiers);
          chartOverlay?.refresh();
          // Cosmetic affirmation the pick landed (view-only, muted-safe).
          view?.flourish(w!.player.x, w!.player.y);
          hud.levelPulse();
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
      view?.pushShake(7, 0.12);
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
      view?.pushShake(7, 0.12);
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
  let lastReplay: { seed: number; mover: MoverName; policy: string; genre: GenreId } | null = null;
  /** Background probe: a second headless copy of the run raced ahead to
   *  discover where it actually ends, so the seek bar can span the real
   *  run (its right edge = the moment of death) instead of a flat 8:00. */
  let probe: { world: RunWorld; conductor: VirtualConductor; endT: number | null } | null = null;
  const seekOverlay = document.createElement('div');
  seekOverlay.className = 'seek-overlay';
  seekOverlay.style.display = 'none';
  root.appendChild(seekOverlay);
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
      startReplay(r.seed, r.mover, r.policy, r.genre);
    }
    replayTarget = targetS;
    applyGain();
  }

  /** The probe is the same run again (same seed, same policies), stepped in
   *  spare frame time with no fx and no view until it ends. */
  function startProbe(
    seed: number,
    moverName: MoverName,
    policySpec: string,
    genreId: GenreId,
  ): void {
    const rng = mulberry32(seed);
    const policy = makePolicy(policySpec);
    const mover = (MOVERS[moverName] ?? MOVERS.kiter)();
    const events = {
      onLevelUp: () => probe?.conductor.onLevelUp(),
      onDeath: () => finishProbe(),
      onVictory: () => finishProbe(),
      onHit: () => {},
    };
    const w: RunWorld = new RunWorld(SIM_VIEW, events, {
      rng,
      control: () => mover(w),
      fx: false,
    });
    w.powerMul = (GENRE_BY_ID[genreId] ?? GENRE_BY_ID[DEFAULT_GENRE]).powerMul;
    const conductor = new VirtualConductor(w, policy.choose, rng);
    probe = { world: w, conductor, endT: null };
    conductor.start(policy.startingKit(rng));
  }

  function finishProbe(): void {
    if (!probe || probe.endT !== null) return;
    probe.endT = probe.world.timeS;
    seekSlider.max = String(Math.ceil(probe.endT));
  }

  /** Step the probe inside a small per-frame budget until it ends. */
  function pumpProbe(): void {
    if (!probe || probe.endT !== null) return;
    const deadline = performance.now() + 6;
    let guard = 0;
    while (probe.endT === null && performance.now() < deadline && guard++ < 4000) {
      probe.conductor.tick(SIM_DT);
      probe.world.update(SIM_DT);
    }
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
    paused = false;
    pauseOverlay.style.display = 'none';
    sandboxPanel?.destroy();
    sandboxPanel = null;
    view?.destroy();
    view = null;
    world = null;
    replayConductor = null;
    replayAcc = 0;
    probe = null;
    seekOverlay.style.display = 'none';
    engine.clearBarQueue();
    engine.clearVoiceEffects();
    for (const role of ROLES) {
      engine.setVoiceEnabled(role, false);
      engine.setVoiceGated(role, false);
    }
    // Reset the hype layer and re-open the tone filter (a fresh run starts wide
    // open until the meter drives it back down).
    hype.reset();
    hype.show(false);
    engine.setToneCutoff(20000);
  }

  function startRun(genre: Genre, startingKit: Role): void {
    resetWorld();
    world = new RunWorld(app.screen, events, { control: () => input.axis() });
    world.powerMul = genre.powerMul;
    view = new RunView(world, app.screen);
    app.stage.addChild(view.stage);
    // Set the genre first: it re-points every voice's chart, so the tier set
    // below reads the genre's own pattern for the starting instrument.
    engine.setGenre(genre);
    engine.setVoiceTier(startingKit, 1);
    engine.setVoiceEnabled(startingKit, true);
    world.addWeapon(startingKit, 1);
    hud.showHud(true);
    hud.renderItems(world.items);
    hud.renderBand(world.tiers);
    hype.show(true);
    state = 'run';
    void engine.ctx.resume();
    engine.clock.start();
  }

  function startSandbox(): void {
    resetWorld();
    const w = new RunWorld(app.screen, sandboxEvents, {
      scripted: false,
      control: () => input.axis(),
    });
    world = w;
    const applyGenre = (g: Genre): void => {
      engine.setGenre(g);
      w.powerMul = g.powerMul;
    };
    applyGenre(GENRE_BY_ID[DEFAULT_GENRE]);
    w.invincible = true;
    view = new RunView(w, app.screen);
    app.stage.addChild(view.stage);
    sandboxPanel = mountSandboxPanel(root, engine, w, {
      genres: GENRES,
      initial: DEFAULT_GENRE,
      onGenre: applyGenre,
      onLoadout: () => hud.renderBand(w.tiers),
      onExit: () => {
        resetWorld();
        engine.clock.stop();
        hud.showHud(false);
        hud.showStart(GENRES, startRun, startSandbox);
        state = 'start';
      },
    });
    hud.showHud(true);
    hud.renderBand(w.tiers);
    hype.show(true);
    state = 'sandbox';
    void engine.ctx.resume();
    engine.clock.start();
  }

  /** Bot replay (docs/tools/autoplay-bot.md): re-run a batch seed live and
   *  watchable. The world runs at the sim's fixed dimensions and fixed
   *  60 Hz ticks under the seeded RNG, so it is tick-identical to the
   *  headless run; the view and the engine's sound ride along. */
  function startReplay(
    seed: number,
    moverName: MoverName,
    policySpec: string,
    genreId: GenreId,
  ): void {
    resetWorld();
    replayTarget = null;
    lastReplay = { seed, mover: moverName, policy: policySpec, genre: genreId };
    const genre = GENRE_BY_ID[genreId] ?? GENRE_BY_ID[DEFAULT_GENRE];
    // Set genre before the conductor starts: it drives the virtual clock's
    // tempo (activeGenreBpm) and the charts, matching the headless batch run.
    engine.setGenre(genre);
    const rng = mulberry32(seed);
    const policy = makePolicy(policySpec);
    const mover = (MOVERS[moverName] ?? MOVERS.kiter)();
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
        view?.pushShake(7, 0.12);
      },
    };
    const w: RunWorld = new RunWorld(SIM_VIEW, replayEvents, { rng, control: () => mover(w) });
    w.powerMul = genre.powerMul;
    world = w;
    replayConductor = new VirtualConductor(w, policy.choose, rng, {
      onPick(option) {
        hud.showToast(`bot picks ${pickLabel(option)}`);
      },
      onApply(option) {
        // the sound mirrors the sim's build; gameplay is driven by the
        // virtual clock, the engine only plays along. Items touch no voice
        // tier; an effect swaps the voice's audio fx chain.
        if (option.kind === 'weapon') {
          engine.setVoiceTier(option.role, option.tier);
          engine.setVoiceEnabled(option.role, true);
        } else if (option.kind === 'effect') {
          engine.setVoiceEffect(option.role, option.effect);
        }
        hud.renderItems(w.items);
        hud.renderBand(w.tiers);
        chartOverlay?.refresh();
      },
      onHeal() {
        hud.showToast('+15 hp — the track is complete');
      },
    });
    view = new RunView(w, app.screen);
    app.stage.addChild(view.stage);
    hud.showHud(true);
    hud.renderItems(w.items);
    hud.renderBand(w.tiers);
    hud.showToast(`replaying seed ${seed} (${genre.name}/${moverName}/${policySpec})`);
    speedRow.style.display = '';
    seekRow.style.display = '';
    seekSlider.value = '0';
    seekSlider.max = String(RUN.durationS);
    seekLabel.textContent = '0:00';
    setReplaySpeed(1);
    startProbe(seed, moverName, policySpec, genreId);
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
    seekOverlay.style.display = 'none';
    replaySpeed = 1;
    replayTarget = null;
    probe = null;
    applyGain();
    engine.clock.stop();
    engine.clearBarQueue();
    hype.show(false);
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
        hud.showStart(GENRES, startRun, startSandbox);
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
    if (paused) return;
    if ((state === 'run' || state === 'sandbox') && world) {
      const dt = Math.min(ticker.deltaMS / 1000, 1 / 20); // clamp long frames
      // Ride the hype layer: drain the meter, gate the band's layers, sweep the
      // tone filter, and set the world's risk/reward multipliers for this frame.
      hype.tick(dt, engine, world, world.tiers);
      world.update(dt);
      view?.update(dt);
      hud.setStatus(
        world.player.hp / RUN.playerHp,
        world.xpProgress(),
        world.level,
        world.timeS,
      );
    } else if (state === 'replay' && world && replayConductor) {
      pumpProbe();
      if (replayTarget !== null) {
        // seeking: the picture freezes behind a "jumping to…" note while
        // the sim computes flat out inside a per-frame budget — a seek
        // should read as a load, not as hyper-speed gameplay
        const deadline = performance.now() + 40;
        while (
          state === 'replay' &&
          world.timeS < replayTarget &&
          performance.now() < deadline
        ) {
          replayConductor.tick(SIM_DT);
          world.update(SIM_DT);
        }
        if (state === 'replay') {
          if (world.timeS >= replayTarget) {
            replayTarget = null;
            replayAcc = 0;
            seekOverlay.style.display = 'none';
            if (world.fx) world.fx.length = 0; // drop queued juice from the jump
            applyGain();
          } else {
            if (world.fx) world.fx.length = 0; // nobody draws during the jump
            seekOverlay.style.display = '';
            seekOverlay.textContent = `jumping to ${fmtTime(replayTarget)} — at ${fmtTime(world.timeS)}`;
            if (!seekDragging) seekSlider.value = String(Math.floor(world.timeS));
            return; // picture stays frozen while jumping
          }
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
    if (e.code === 'Escape') {
      togglePause();
      return;
    }
    // SPACE arms the Drop (the Conducted Grid): a charged Drop strips the band
    // and slams it back in on the next bars. Desktop twin of the on-screen DROP
    // button. Ignore key-repeat so a held key is one arm, not a stream.
    if (e.code === 'Space') {
      e.preventDefault();
      if (!paused && (state === 'run' || state === 'sandbox') && !e.repeat) hype.arm();
      return;
    }
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

  function pickLabel(option: PickOption): string {
    if (option.kind === 'item') return `${ITEMS[option.item].name} Lv ${option.level}`;
    const kit = kits.get(option.role)!;
    if (option.kind === 'effect') return `${kit.name} · ${EFFECT_META[option.effect].name}`;
    return option.tier > 1 ? `${kit.name} ${TIER_NUMERALS[option.tier - 1]}` : kit.name;
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
      (params.get('genre') ?? DEFAULT_GENRE) as GenreId,
    );
  } else {
    hud.showStart(GENRES, startRun, startSandbox);
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

