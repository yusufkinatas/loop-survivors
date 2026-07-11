// The game shell: Pixi app, run states, and the wiring between the music
// engine and the world. The engine stays a pure function of build and grid;
// the game only listens to its triggers and toggles voices on picks.

import { Application } from 'pixi.js';
import type { MusicEngine } from '../audio/engine';
import { SOUNDSET } from '../audio/soundset';
import { ROLES, type Kit, type Role } from '../audio/kits';
import { SIM_DT, VirtualConductor } from '../bot/conductor';
import { MOVERS, type Mover, type MoverName } from '../bot/movers';
import { makePolicy } from '../bot/policies';
import { SIM_VIEW } from '../bot/sim';
import { RUN } from './config';
import { SLOTS, ownerOfSlot } from './band';
import { mountTrackOverlay } from './trackoverlay';
import { Hud, TIER_NUMERALS } from './hud';
import { autoMove, Input, type AutoMoveMode } from './input';
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
  let state: State = 'start';
  let world: RunWorld | null = null;
  let view: RunView | null = null;
  let muted = false;
  let paused = false;

  // Auto-move (developer request): a mover can drive the player instead of the
  // keyboard/joystick. The mode is chosen on the start screen AND can be
  // toggled/cycled live in-game (the auto-move debug button + hotkey). The
  // control seam reads this state every frame, so a mid-run switch takes hold
  // on the next tick.
  let autoMode: AutoMoveMode = 'off';
  let autoMoverFn: Mover | null = null;
  function setAutoMode(mode: AutoMoveMode): void {
    autoMode = mode;
    autoMove.active = mode !== 'off'; // suppresses the touch joystick on mobile
    // Movers carry per-run state (the harvester's orbit/target memory), so a
    // switch hands out a fresh instance.
    autoMoverFn =
      mode === 'kiter' ? MOVERS.kiter() : mode === 'greedy' ? MOVERS.harvester() : null;
    hud.refreshDebug(); // keep the auto-move button's label/state in sync
  }
  /** The player's movement each frame: the active mover, or manual input. */
  function playerControl(w: RunWorld): { x: number; y: number } {
    return autoMoverFn ? autoMoverFn(w) : input.axis();
  }

  // Pause overlay: ESC freezes the run behind a dimmed screen; the audio clock
  // stops so no triggers fire, and the game loop skips its world step. A second
  // ESC resumes. Only the live run pauses — menus and replays have their own
  // controls (the replay has speed/seek).
  const pauseOverlay = document.createElement('div');
  pauseOverlay.className = 'screen pause-overlay';
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
      if (world) hud.renderBand(world.tiers, pauseRack, mutedRoles);
    } else engine.clock.resume();
  }

  // debug overlay
  const overlay = document.createElement('div');
  overlay.className = 'debug-overlay';
  overlay.style.display = 'none';
  root.appendChild(overlay);

  // Every XP threshold and every elite kill grants one upgrade. Several can
  // arrive in the same simulation tick, including while the first pick screen
  // is already open, so callbacks enqueue instead of being discarded by the
  // state guard. A queued pick is not presented until the previous choice has
  // actually entered on its next bar.
  const pendingUpgrades: number[] = [];
  let pickAwaitingBar = false;
  let presentQueuedPickAtAudioT: number | null = null;

  function resetUpgradeQueue(): void {
    pendingUpgrades.length = 0;
    pickAwaitingBar = false;
    presentQueuedPickAtAudioT = null;
  }

  function enqueueUpgrade(level: number): void {
    if (!world || (state !== 'run' && state !== 'pick')) return;
    pendingUpgrades.push(level);
    presentNextUpgrade();
  }

  function presentNextUpgrade(): void {
    if (!world || state !== 'run' || pickAwaitingBar || presentQueuedPickAtAudioT !== null) return;

    // Once the build is complete, each queued reward resolves to the existing
    // heal fallback immediately; otherwise exactly one screen is active.
    while (pendingUpgrades.length > 0) {
      pendingUpgrades.shift();
      const w = world;
      // The offer roll (docs/phases/m2-the-arc.md) is shared with the autoplay
      // bot via picks.ts, so the bot faces the exact offers a player does.
      const options = rollOffers(w.tiers, Math.random, w.timeS);
      if (options.length === 0) {
        w.player.hp = Math.min(RUN.playerHp, w.player.hp + 15);
        hud.showToast('+15 hp — the track is complete');
        continue;
      }

      state = 'pick';
      engine.clock.pause();
      hud.showPick(options, (option) => {
        // Resume the old arrangement long enough to reach the next bar. No
        // later queued pick can open while this choice is still in flight.
        state = 'run';
        pickAwaitingBar = true;
        engine.atNextBar((barAudioTime) => {
          if (world !== w || state !== 'run') return;
          engine.setVoiceTier(option.role, option.tier);
          engine.setVoiceEnabled(option.role, true);
          w.addWeapon(option.role, option.tier);
          hud.renderBand(w.tiers, undefined, mutedRoles);
          refreshTrackOverlay();
          // Cosmetic affirmation the pick landed (view-only, muted-safe).
          view?.flourish(w.player.x, w.player.y);
          hud.levelPulse();
          pickAwaitingBar = false;
          // The audio scheduler runs ahead. Wait until this bar's due gameplay
          // triggers have been dispatched and consumed by one fixed world step
          // before pausing for a stacked reward.
          presentQueuedPickAtAudioT = barAudioTime;
        });
        engine.clock.resume();
      });
      return;
    }
  }

  const events = {
    onLevelUp(level: number): void {
      enqueueUpgrade(level);
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
  let liveAcc = 0;
  let replayAcc = 0;
  let replaySpeed = 1;
  const LIVE_MAX_STEPS = 6;

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
      startReplay(r.seed, r.mover, r.policy);
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
    w.powerMul = SOUNDSET.powerMul;
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
    resetUpgradeQueue();
    liveAcc = 0;
    setAutoMode('off'); // manual by default; startRun re-arms it if chosen
    pauseOverlay.style.display = 'none';
    sandboxPanel?.destroy();
    sandboxPanel = null;
    view?.destroy();
    view = null;
    world = null;
    resetMutes(); // new run starts with every voice audible
    replayConductor = null;
    replayAcc = 0;
    probe = null;
    seekOverlay.style.display = 'none';
    engine.clearBarQueue();
    for (const role of ROLES) engine.setVoiceEnabled(role, false);
  }

  function startRun(startingKit: Role, mode: AutoMoveMode = 'off'): void {
    resetWorld();
    // Auto-move hands the player's movement to a bot mover (kiter = survival,
    // greedy = the gem-hungry harvester); manual keeps the keyboard/joystick.
    // The seam reads playerControl live, so the in-game toggle works too.
    setAutoMode(mode);
    const w: RunWorld = new RunWorld(app.screen, events, {
      control: () => playerControl(w),
    });
    world = w;
    w.powerMul = SOUNDSET.powerMul;
    view = new RunView(w, app.screen);
    app.stage.addChild(view.stage);
    engine.setVoiceTier(startingKit, 1);
    engine.setVoiceEnabled(startingKit, true);
    w.addWeapon(startingKit, 1);
    hud.showHud(true);
    hud.renderBand(w.tiers);
    state = 'run';
    void engine.ctx.resume();
    engine.clock.start();
  }

  function startSandbox(): void {
    resetWorld();
    const w: RunWorld = new RunWorld(app.screen, sandboxEvents, {
      scripted: false,
      control: () => playerControl(w),
    });
    world = w;
    w.powerMul = SOUNDSET.powerMul;
    w.invincible = true;
    view = new RunView(w, app.screen);
    app.stage.addChild(view.stage);
    sandboxPanel = mountSandboxPanel(root, engine, w, {
      onLoadout: () => {
        hud.renderBand(w.tiers, undefined, mutedRoles);
        refreshTrackOverlay();
      },
      onExit: () => {
        resetWorld();
        engine.clock.stop();
        hud.showHud(false);
        hud.showStart(startRun, startSandbox);
        state = 'start';
      },
    });
    hud.showHud(true);
    hud.renderBand(w.tiers);
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
  ): void {
    resetWorld();
    replayTarget = null;
    lastReplay = { seed, mover: moverName, policy: policySpec };
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
    w.powerMul = SOUNDSET.powerMul;
    world = w;
    replayConductor = new VirtualConductor(w, policy.choose, rng, {
      onPick(option) {
        hud.showToast(`bot picks ${pickLabel(option)}`);
      },
      onApply(option) {
        // the sound mirrors the sim's build; gameplay is driven by the
        // virtual clock, the engine only plays along.
        engine.setVoiceTier(option.role, option.tier);
        engine.setVoiceEnabled(option.role, true);
        hud.renderBand(w.tiers, undefined, mutedRoles);
        refreshTrackOverlay();
      },
      onHeal() {
        hud.showToast('+15 hp — the track is complete');
      },
    });
    view = new RunView(w, app.screen);
    app.stage.addChild(view.stage);
    hud.showHud(true);
    hud.renderBand(w.tiers);
    hud.showToast(`replaying seed ${seed} (${moverName}/${policySpec})`);
    speedRow.style.display = '';
    seekRow.style.display = '';
    seekSlider.value = '0';
    seekSlider.max = String(RUN.durationS);
    seekLabel.textContent = '0:00';
    setReplaySpeed(1);
    startProbe(seed, moverName, policySpec);
    state = 'replay';
    void engine.ctx.resume();
    engine.clock.start();
    replayConductor.start(policy.startingKit(rng));
  }

  function endRun(victory: boolean): void {
    if (!world || state === 'end') return;
    state = 'end';
    resetUpgradeQueue();
    liveAcc = 0;
    speedRow.style.display = 'none';
    seekRow.style.display = 'none';
    seekOverlay.style.display = 'none';
    replaySpeed = 1;
    replayTarget = null;
    probe = null;
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

  // The minimal track overlay (dev tools, hotkey C): a compact "now playing"
  // readout — one row per active voice with a single-bar mini grid and a
  // moving playhead. Replaces the old wide chart dock; the rehearsal room
  // keeps the full editable playground.
  const trackOverlayEl = document.createElement('div');
  trackOverlayEl.className = 'track-overlay';
  trackOverlayEl.style.display = 'none';
  root.appendChild(trackOverlayEl);
  const trackOverlay = mountTrackOverlay(trackOverlayEl, engine, kits);
  function refreshTrackOverlay(): void {
    if (trackOverlayEl.style.display === 'none') return;
    trackOverlay.refresh(world?.tiers ?? new Map(), mutedRoles);
  }
  function toggleChartOverlay(): void {
    const show = trackOverlayEl.style.display === 'none';
    trackOverlayEl.style.display = show ? '' : 'none';
    if (show) refreshTrackOverlay();
  }

  // Number-key track toggles (dev mechanism): Digit1..Digit8 map to the eight
  // band slots in rack order and mute the AUDIO of the instrument owning that
  // slot. Audio-only — engine triggers, damage, determinism, and replays are
  // untouched; only the voice's gain goes to 0.
  const mutedRoles = new Set<Role>();
  function toggleRoleMute(role: Role): void {
    if (mutedRoles.has(role)) {
      mutedRoles.delete(role);
      engine.setVoiceGain(role, 1);
    } else {
      mutedRoles.add(role);
      engine.setVoiceGain(role, 0);
    }
    if (world) {
      hud.renderBand(world.tiers, undefined, mutedRoles);
      // The pause menu mirrors the same rack; keep it truthful if it's open.
      if (paused) hud.renderBand(world.tiers, pauseRack, mutedRoles);
    }
    refreshTrackOverlay();
  }
  function resetMutes(): void {
    for (const role of mutedRoles) engine.setVoiceGain(role, 1);
    mutedRoles.clear();
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
      const frameS = ticker.deltaMS / 1000;
      const visualDt = Math.min(frameS, 1 / 20);
      const steppingState = state;
      const w = world;
      // The live world now advances through the exact same 60 Hz steps as the
      // bot and replay. At most 100 ms is recovered after a slow frame; larger
      // stalls are dropped instead of freezing the page with runaway catch-up.
      liveAcc = Math.min(liveAcc + Math.min(frameS, SIM_DT * LIVE_MAX_STEPS), SIM_DT * LIVE_MAX_STEPS);
      let steps = 0;
      while (
        liveAcc >= SIM_DT &&
        steps < LIVE_MAX_STEPS &&
        world === w &&
        state === steppingState
      ) {
        liveAcc -= SIM_DT;
        steps++;
        w.update(SIM_DT);
      }
      if (
        presentQueuedPickAtAudioT !== null &&
        engine.ctx.currentTime >= presentQueuedPickAtAudioT &&
        steps > 0 &&
        world === w &&
        state === 'run'
      ) {
        presentQueuedPickAtAudioT = null;
        presentNextUpgrade();
      }
      // A level-up/death can change state inside a fixed step. Paused gameplay
      // never resumes with fractional time banked from before the screen opened.
      if (state !== steppingState || world !== w) liveAcc = 0;
      view?.update(visualDt);
      hud.setStatus(
        w.player.hp / RUN.playerHp,
        w.xpProgress(),
        w.level,
        w.timeS,
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
    if (trackOverlayEl.style.display !== 'none') trackOverlay.tick();
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
    // Auto-move toggle: cycles Manual -> Kiter -> Greedy -> Manual live. The
    // label shows the active mode; highlights (like invincible) while auto.
    autokite: {
      label: 'auto-move',
      hotkey: 'B',
      isOn: () => autoMode !== 'off',
      dynamicLabel: () => (autoMode === 'off' ? 'auto-move' : `auto: ${autoMode}`),
      onClick: () => {
        if (state !== 'run' && state !== 'sandbox') return;
        setAutoMode(autoMode === 'off' ? 'kiter' : autoMode === 'kiter' ? 'greedy' : 'off');
        hud.showToast(
          autoMode === 'off' ? 'auto-move off — you have the controls' : `auto-move: ${autoMode}`,
        );
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
      label: 'track',
      hotkey: 'C',
      isOn: () => trackOverlayEl.style.display !== 'none',
      onClick: toggleChartOverlay,
    },
  };
  hud.mountDebug(Object.values(debugActions));

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') {
      togglePause();
      return;
    }
    // Number-key track toggles: only while playing (never over the start /
    // pick / end screens, mirroring the state guards the debug actions use).
    if (/^Digit[1-8]$/.test(e.code) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if ((state === 'run' || state === 'sandbox' || state === 'replay') && world) {
        const slot = SLOTS[Number(e.code.slice(5)) - 1];
        const role = ownerOfSlot(slot, world.tiers);
        if (role) toggleRoleMute(role); // empty slot: the key does nothing
      }
      return;
    }
    const byKey: Record<string, { onClick(): void }> = {
      KeyM: debugActions.mute,
      KeyI: debugActions.invincible,
      KeyB: debugActions.autokite,
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
    const kit = kits.get(option.role)!;
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
