// The game shell: Pixi app, run states, and the wiring between the music
// engine and the world. The engine stays a pure function of build and grid;
// the game only listens to its triggers and toggles voices on picks.

import { Application } from 'pixi.js';
import type { MusicEngine } from '../audio/engine';
import { SOUNDSET } from '../audio/soundset';
import { ROLES, type Kit, type Role } from '../audio/kits';
import { RUN, LEVELUP } from './config';
import { SLOTS, ownerOfSlot } from './band';
import { mountTrackOverlay } from './trackoverlay';
import { Hud } from './hud';
import { createGreedyMover, createKiter, type AutoMover } from './auto-move';
import { autoMove, Input, type AutoMoveMode } from './input';
import { mountJoystick } from './joystick';
import { rollOffers, type PickOption } from './picks';
import { RunWorld, KIT_COLORS } from './run';
import { SIM_DT } from './timing';
import { RunView, type GroundPickView } from './view';
import { mountSandboxPanel, type SandboxPanel } from './sandbox';

type State = 'start' | 'run' | 'end' | 'sandbox';

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

  // Global time scale (issue #21): one knob scaling the sim, audio tempo, and
  // world juice together, live mid-run, in run + sandbox only. Continuous
  // underneath (future slow-mo / hit-stop can set any float); the control
  // surface below clamps to the slider's 0.25–3.0 grid. Snaps back to 1.0 on
  // every new run / sandbox entry (reset in resetWorld). Owned here alongside
  // muted / paused / autoMode — the same one-place-per-shell-flag pattern.
  let timeScale = 1;
  // Level-up slow-mo: a transient scale that COMPOSES with the dev timeScale.
  // The loop and audio clock use `timeScale * momentScale`; the dev slider
  // still shows/controls `timeScale` alone. `momentT` is real seconds left in
  // the current level-up moment (purely cosmetic).
  let momentScale = 1;
  let momentT = 0;
  const TS_MIN = 0.25;
  const TS_MAX = 3;
  const TS_STEP = 0.25;
  // Built after mountDebug (below); setTimeScale drives both, the loop reads
  // `timeScale`. Declared here so setTimeScale can close over them.
  let tsSlider: HTMLInputElement;
  let tsControl: HTMLElement;
  let tsLabel: HTMLElement;
  /** timeScale is only live in run + sandbox; menus have no world to scale. */
  function timeScaleLive(): boolean {
    return state === 'run' || state === 'sandbox';
  }
  // The one place timeScale changes: clamp to the control range, snap to the
  // step grid (so keyboard nudges and the slider agree exactly), push to the
  // audio clock (a neutral tempo multiplier), and sync the slider + readout.
  // The sim + view loop read `timeScale` live.
  function setTimeScale(v: number): void {
    const clamped = Math.max(TS_MIN, Math.min(TS_MAX, v));
    timeScale = Math.round(clamped / TS_STEP) * TS_STEP;
    applyClockRate();
    if (tsSlider) tsSlider.value = String(timeScale);
    if (tsLabel) tsLabel.textContent = `speed ${timeScale.toFixed(2)}x`;
  }
  /** Push the effective rate (dev timeScale × the transient level-up moment)
   *  to the audio clock. */
  function applyClockRate(): void {
    engine.clock.rate = timeScale * momentScale;
  }
  /** End the level-up slow-mo moment early / restore normal rate. */
  function endLevelMoment(): void {
    momentT = 0;
    if (momentScale !== 1) {
      momentScale = 1;
      applyClockRate();
      engine.restoreWeapons();
    }
  }
  function syncTimeScaleControl(): void {
    if (!tsSlider) return;
    const live = timeScaleLive();
    tsSlider.disabled = !live;
    tsControl.classList.toggle('disabled', !live);
  }

  // Auto-move (developer request): a mover can drive the player instead of the
  // keyboard/joystick. The mode is chosen on the start screen AND can be
  // toggled/cycled live in-game (the auto-move debug button + hotkey). The
  // control seam reads this state every frame, so a mid-run switch takes hold
  // on the next tick.
  let autoMode: AutoMoveMode = 'off';
  let autoMoverFn: AutoMover | null = null;
  function setAutoMode(mode: AutoMoveMode): void {
    autoMode = mode;
    autoMove.active = mode !== 'off'; // suppresses the touch joystick on mobile
    // Movers carry per-run state (the harvester's orbit/target memory), so a
    // switch hands out a fresh instance.
    autoMoverFn =
      mode === 'kiter' ? createKiter() : mode === 'greedy' ? createGreedyMover() : null;
    hud.refreshDebug(); // keep the auto-move button's label/state in sync
  }
  /** The player's movement each frame: the active mover, or manual input. */
  function playerControl(w: RunWorld): { x: number; y: number } {
    return autoMoverFn ? autoMoverFn(w) : input.axis();
  }

  // Pause overlay: ESC freezes the run behind a dimmed screen; the audio clock
  // stops so no triggers fire, and the game loop skips its world step. A second
  // ESC resumes. Only the live run pauses.
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
      engine.holdTransport();
      // Show the current band while paused (the same rack the HUD draws).
      if (world) hud.renderBand(world.tiers, pauseRack, mutedRoles);
    } else {
      engine.releaseTransport();
      engine.clock.resume();
    }
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
  // The level-up offers currently dropped on the ground as physical items, in
  // a triangle around the player. Shell-owned (never entities in the
  // simulation), so it stays independent from world entities. Empty = none.
  interface GroundItem {
    x: number;
    y: number;
    option: PickOption;
  }
  let groundPicks: GroundItem[] = [];

  function clearGroundPicks(): void {
    if (groundPicks.length > 0) groundPicks = [];
    view?.setGroundPicks([]);
  }

  function resetUpgradeQueue(): void {
    pendingUpgrades.length = 0;
    pickAwaitingBar = false;
    presentQueuedPickAtAudioT = null;
    clearGroundPicks();
    endLevelMoment();
  }

  function enqueueUpgrade(level: number): void {
    if (!world || state !== 'run') return;
    pendingUpgrades.push(level);
  }

  // A level-up no longer opens a menu: the three offers drop as items on the
  // ground and the run keeps playing. Only one triangle is out at a time; a
  // queued reward waits until the current one is collected and its weapon has
  // entered on the next bar (pickAwaitingBar / presentQueuedPickAtAudioT).
  function presentNextUpgrade(): void {
    if (!world || state !== 'run' || pickAwaitingBar || presentQueuedPickAtAudioT !== null) return;
    if (groundPicks.length > 0) return; // one triangle at a time

    const w = world;
    // Build-complete rewards have no item to drop and resolve to the heal
    // fallback immediately; the first real offer drops a triangle and stops.
    while (pendingUpgrades.length > 0 && groundPicks.length === 0) {
      pendingUpgrades.shift();
      // Roll the real three-option offer for this reward.
      const options = rollOffers(w.tiers, Math.random, w.timeS);
      if (options.length === 0) {
        w.player.hp = Math.min(RUN.playerHp, w.player.hp + 15);
        hud.showToast('+15 hp — the track is complete');
        continue;
      }
      dropGroundPicks(w, options);
    }
  }

  /** Drop the offered options as items in a triangle around the player, shove
   *  the horde clear of them, and fire the cosmetic level-up moment. */
  function dropGroundPicks(w: RunWorld, options: PickOption[]): void {
    const cx = w.player.x;
    const cy = w.player.y;
    const items: GroundItem[] = [];
    const payload: GroundPickView[] = [];
    for (let i = 0; i < options.length; i++) {
      const option = options[i];
      const deg = LEVELUP.angles[i % LEVELUP.angles.length];
      const rad = (deg * Math.PI) / 180;
      const x = cx + Math.cos(rad) * LEVELUP.itemRadius;
      const y = cy + Math.sin(rad) * LEVELUP.itemRadius;
      items.push({ x, y, option });
      const prevTier = w.tiers.get(option.role) ?? 0;
      payload.push({
        x,
        y,
        role: option.role,
        color: KIT_COLORS[option.role],
        name: kits.get(option.role)!.name,
        // New pick reads "1"; a tier-up reads e.g. "2 → 3".
        level: prevTier > 0 ? `${prevTier} → ${option.tier}` : '1',
      });
    }
    groundPicks = items;
    view?.setGroundPicks(payload);
    w.shoveEnemiesOut(cx, cy, LEVELUP.enemyPushRadius);
    startLevelMoment(cx, cy);
  }

  /** The satisfying beat: slowScale slow-mo + weapon-volume duck for up to
   *  momentS, plus a bright cue and a screen pulse. Everything snaps back when
   *  the player collects a pick, or when momentS elapses, whichever is first. */
  function startLevelMoment(cx: number, cy: number): void {
    momentT = LEVELUP.momentS;
    momentScale = LEVELUP.slowScale;
    applyClockRate();
    engine.duckWeapons(LEVELUP.duckDepth, LEVELUP.momentS);
    engine.playLevelCue();
    hud.levelPulse();
    view?.levelBurst(cx, cy);
  }

  /** Walk-onto collection: take one item, clear the rest, and enter the chosen
   *  weapon on the next bar (audio keeps playing — no transport hold). Mirrors
   *  the old pick's bar-accurate entry so old-tier damage is preserved. */
  function collectGroundPick(item: GroundItem): void {
    const w = world;
    if (!w) return;
    // The player reached a pick before momentS elapsed: snap game speed and
    // weapon volume back now instead of riding out the full slow-mo.
    endLevelMoment();
    const option = item.option;
    clearGroundPicks();
    pickAwaitingBar = true;
    engine.atNextBar((barAudioTime) => {
      if (world !== w || state !== 'run') return;
      // Audio is scheduled ahead, so its chart must change now for the first
      // note of the new bar. World state waits for the exact heard timestamp
      // below, preserving old-tier damage on any older trigger.
      engine.setVoiceTier(option.role, option.tier);
      engine.setVoiceEnabled(option.role, true);
      engine.atAudioTime(barAudioTime, () => {
        if (world !== w || state !== 'run') return;
        w.addWeapon(option.role, option.tier);
        hud.renderBand(w.tiers, undefined, mutedRoles);
        refreshTrackOverlay();
        view?.flourish(w.player.x, w.player.y);
        pickAwaitingBar = false;
        // Wait until this bar's due gameplay triggers have been consumed by one
        // fixed world step before dropping a stacked reward's triangle.
        presentQueuedPickAtAudioT = barAudioTime;
      });
    });
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
  let liveAcc = 0;
  const LIVE_MAX_STEPS = 6;

  function applyGain(): void {
    engine.setMasterGain(muted ? 0 : 0.8);
  }

  function resetWorld(): void {
    paused = false;
    resetUpgradeQueue();
    liveAcc = 0;
    setTimeScale(1); // every new run or sandbox starts at normal speed
    syncTimeScaleControl(); // disabled until startRun/startSandbox re-enables it
    setAutoMode('off'); // manual by default; startRun re-arms it if chosen
    pauseOverlay.style.display = 'none';
    sandboxPanel?.destroy();
    sandboxPanel = null;
    view?.destroy();
    view = null;
    world = null;
    resetMutes(); // new run starts with every voice audible
    engine.clearBarQueue();
    for (const role of ROLES) engine.setVoiceEnabled(role, false);
  }

  function startRun(startingKit: Role, mode: AutoMoveMode = 'off'): void {
    resetWorld();
    // Auto-move hands movement to a kiter or gem-hungry greedy mode;
    // manual keeps the keyboard/joystick.
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
    syncTimeScaleControl(); // arm the timeScale slider for the live run
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
        syncTimeScaleControl(); // resetWorld ran while still 'sandbox'; re-grey now
      },
    });
    hud.showHud(true);
    hud.renderBand(w.tiers);
    state = 'sandbox';
    syncTimeScaleControl(); // arm the timeScale slider for the sandbox
    void engine.ctx.resume();
    engine.clock.start();
  }

  function endRun(victory: boolean): void {
    if (!world || state === 'end') return;
    state = 'end';
    syncTimeScaleControl(); // no live world to scale on the end screen
    resetUpgradeQueue();
    liveAcc = 0;
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

  // Number-key track toggles (dev mechanism): Digit1..Digit7 map to the seven
  // band slots in rack order and mute the AUDIO of the instrument owning that
  // slot. Audio-only: engine triggers and damage are untouched; only the
  // voice's gain goes to 0.
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
      // The level-up moment is a wall-clock slow-mo: tick it down on real time
      // and fold it into the effective scale (issue #21's dev timeScale stays
      // independent). When it runs out, the rate snaps back to normal.
      if (momentT > 0) {
        momentT = Math.max(0, momentT - frameS);
        if (momentT === 0) endLevelMoment();
      }
      const ts = timeScale * momentScale;
      // timeScale (issue #21) compresses / expands wall-clock. The sim still
      // only advances in fixed SIM_DT ticks: ts scales the count of ticks paid
      // out per frame, never their size. The per-frame step cap scales so a
      // legitimate fast frame isn't silently throttled, but stays bounded so a
      // stalled frame or backgrounded tab drops time instead of spiralling.
      const maxSteps = Math.max(1, Math.ceil(LIVE_MAX_STEPS * ts));
      const budget = SIM_DT * maxSteps;
      // Guard the RAW frame delta against a stall first (never recover more than
      // LIVE_MAX_STEPS of wall time), THEN scale that to simulated time.
      const simS = Math.min(frameS, SIM_DT * LIVE_MAX_STEPS) * ts;
      const visualDt = Math.min(frameS, 1 / 20) * ts;
      const steppingState = state;
      const w = world;
      liveAcc = Math.min(liveAcc + Math.min(simS, budget), budget);
      let steps = 0;
      while (
        liveAcc >= SIM_DT &&
        steps < maxSteps &&
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
      // Level and elite rewards are raised from inside RunWorld.update(). Drop
      // their triangle only after the full fixed step has survived, so contact
      // damage later in that same step cannot end a run mid-reward.
      if (steps > 0 && world === w && state === 'run') presentNextUpgrade();
      // Walk-onto collection of a dropped level-up item — a FIXED range, so a
      // future pickup-range buff never reaches it. Checked after stepping so
      // the player's fresh position is used; at most one taken per frame.
      if (groundPicks.length > 0 && world === w && state === 'run') {
        const p = w.player;
        const rr = LEVELUP.itemPickupRadius * LEVELUP.itemPickupRadius;
        for (const item of groundPicks) {
          const dx = p.x - item.x;
          const dy = p.y - item.y;
          if (dx * dx + dy * dy <= rr) {
            collectGroundPick(item);
            break;
          }
        }
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

  // timeScale slider (issue #21): lives in the debug row beside the buttons and
  // shares the debug disclosure. A live readout ("speed 1.50x") + a 0.25-step
  // range; the [ and ] keys drive the same value and drag the handle.
  tsControl = document.createElement('label');
  tsControl.className = 'ts-control';
  tsLabel = document.createElement('span');
  tsLabel.className = 'ts-label';
  tsSlider = document.createElement('input');
  tsSlider.type = 'range';
  tsSlider.min = String(TS_MIN);
  tsSlider.max = String(TS_MAX);
  tsSlider.step = String(TS_STEP);
  tsSlider.value = '1';
  tsControl.append(tsLabel, tsSlider);
  hud.appendDebug(tsControl);
  tsSlider.addEventListener('input', () => {
    if (timeScaleLive()) setTimeScale(Number(tsSlider.value));
    else tsSlider.value = String(timeScale); // inert outside run/sandbox
  });
  tsSlider.addEventListener('change', () => tsSlider.blur()); // keys back to game
  setTimeScale(1); // paint the initial readout ("speed 1.00x")
  syncTimeScaleControl(); // start disabled until a run or sandbox begins

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') {
      togglePause();
      return;
    }
    // timeScale nudge (issue #21): [ slower, ] faster, by one 0.25 step. Live
    // in run + sandbox only; the toast reports it since the slider may be
    // hidden behind the ⚙. setTimeScale drags the slider handle to match.
    if ((e.code === 'BracketLeft' || e.code === 'BracketRight') && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (timeScaleLive()) {
        setTimeScale(timeScale + (e.code === 'BracketRight' ? TS_STEP : -TS_STEP));
        hud.showToast(`speed ${timeScale.toFixed(2)}x`);
      }
      return;
    }
    // Number-key track toggles: only while playing (never over the start /
    // pick / end screens, mirroring the state guards the debug actions use).
    if (/^Digit[1-7]$/.test(e.code) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if ((state === 'run' || state === 'sandbox') && world) {
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

  hud.showStart(startRun, startSandbox);

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
