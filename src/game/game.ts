// The game shell: Pixi app, run states, and the wiring between the music
// engine and the world. The engine stays a pure function of build and grid;
// the game only listens to its triggers and toggles voices on picks.

import { Application } from 'pixi.js';
import type { MusicEngine } from '../audio/engine';
import { SOUNDSET } from '../audio/soundset';
import { ROLES, ROLE_META, type Kit, type Role } from '../audio/kits';
import { RUN, LEVELUP } from './config';
import { SLOTS, ownerOfSlot, slotOf } from './band';
import { mountTrackOverlay } from './trackoverlay';
import { Hud } from './hud';
import { createGreedyMover, createKiter, type AutoMover } from './auto-move';
import { autoMove, Input, type AutoMoveMode } from './input';
import { mountJoystick } from './joystick';
import { rollOffers, type PickOption } from './picks';
import { RunWorld, KIT_COLORS } from './run';
import { PendingRewardQueue, rewardChoiceAngles, type PendingReward } from './rewards';
import { SIM_DT } from './timing';
import { RunView, type GroundPickView } from './view';
import { mountSandboxPanel, type SandboxPanel } from './sandbox';
import {
  EVOLUTION_BY_ROLE,
  GEARS,
  GEAR_CAPACITY,
  canEvolve,
  canOwnGear,
  eligibleEvolutions,
  type GearId,
} from './evolutions';

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
    '<h1>Paused</h1><div class="pause-rack"></div><div class="pause-gear"></div><p class="hint">Hit ESC again to continue.</p>';
  root.appendChild(pauseOverlay);
  const pauseRack = pauseOverlay.querySelector('.pause-rack') as HTMLElement;
  const pauseGear = pauseOverlay.querySelector('.pause-gear') as HTMLElement;
  function togglePause(): void {
    if (state !== 'run') return;
    paused = !paused;
    pauseOverlay.style.display = paused ? '' : 'none';
    if (paused) {
      engine.clock.pause();
      engine.holdTransport();
      // Show the current band while paused (the same rack the HUD draws).
      if (world) {
        hud.renderBand(world.tiers, pauseRack, deactivatedRoles, pendingRoles, world.evolved, pendingEvolutions);
        hud.renderGear(world.gear, pendingGear, pauseGear, true);
      }
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

  type GroundChoice = PickOption | { kind: 'evolution'; role: Role };

  // XP thresholds and collected chests share one FIFO. The active reward stays
  // explicit until its selected build change lands on the heard bar, so a stale
  // sandbox mutation can reroll it without losing or duplicating the reward.
  const pendingRewards = new PendingRewardQueue();
  let activeReward: PendingReward | null = null;
  let activeChestOpened = false;
  let choiceAwaitingBar = false;
  let presentQueuedRewardAtAudioT: number | null = null;
  let rewardGeneration = 0;
  let sandboxBuildGeneration = 0;
  const pendingGear = new Set<GearId>();
  const pendingGearTargets = new Map<GearId, boolean>();
  const pendingEvolutions = new Set<Role>();
  interface GroundItem {
    x: number;
    y: number;
    choice: GroundChoice;
  }
  let groundPicks: GroundItem[] = [];

  function clearGroundPicks(): void {
    if (groundPicks.length > 0) groundPicks = [];
    view?.setGroundPicks([]);
  }

  function resetRewardQueue(): void {
    rewardGeneration++;
    pendingRewards.clear();
    activeReward = null;
    activeChestOpened = false;
    choiceAwaitingBar = false;
    presentQueuedRewardAtAudioT = null;
    pendingGear.clear();
    pendingGearTargets.clear();
    pendingEvolutions.clear();
    clearGroundPicks();
    endLevelMoment();
    sandboxPanel?.refresh();
  }

  function rewardStateLive(): boolean {
    return state === 'run' || state === 'sandbox';
  }

  function enqueueReward(reward: PendingReward): void {
    if (!world || !rewardStateLive()) return;
    pendingRewards.enqueue(reward);
    sandboxPanel?.refresh();
  }

  function rewardQueueLength(): number {
    return pendingRewards.length + (activeReward ? 1 : 0);
  }

  function completeRewardImmediately(): void {
    activeReward = null;
    activeChestOpened = false;
    sandboxPanel?.refresh();
  }

  /** Present one FIFO reward. A level reward rolls normal weapon/Gear choices.
   *  A chest evaluates evolution eligibility now, not at drop/collection time. */
  function presentNextReward(): void {
    if (!world || !rewardStateLive() || choiceAwaitingBar || presentQueuedRewardAtAudioT !== null) return;
    if (groundPicks.length > 0) return;

    const w = world;
    while (!choiceAwaitingBar && groundPicks.length === 0) {
      activeReward ??= pendingRewards.dequeue() ?? null;
      if (!activeReward) break;

      if (activeReward.kind === 'chest') {
        const evolutions = eligibleEvolutions(w.tiers, w.gear, w.evolved);
        if (!activeChestOpened) {
          activeChestOpened = true;
          startRewardMoment(w.player.x, w.player.y, 0xffd76b, false);
        }
        if (evolutions.length === 1) {
          const evolution = evolutions[0];
          hud.showToast(`${ROLE_META[evolution.role].name} → ${evolution.name}`);
          scheduleChoice({ kind: 'evolution', role: evolution.role });
          break;
        }
        if (evolutions.length > 1) {
          dropGroundChoices(w, evolutions.map(({ role }) => ({ kind: 'evolution' as const, role })), false);
          break;
        }
      }

      const options = rollOffers(w.tiers, w.gear, Math.random, w.timeS);
      if (options.length > 0) {
        dropGroundChoices(w, options, activeReward.kind === 'level');
        break;
      }
      w.player.hp = Math.min(RUN.playerHp, w.player.hp + 15);
      hud.showToast('+15 hp — the track is complete');
      completeRewardImmediately();
    }
  }

  /** Drop normal or evolution choices around the player. Two evolution tokens
   *  oppose each other; three/four use the locked symmetric layouts. */
  function dropGroundChoices(w: RunWorld, choices: GroundChoice[], levelMoment: boolean): void {
    const cx = w.player.x;
    const cy = w.player.y;
    const items: GroundItem[] = [];
    const payload: GroundPickView[] = [];
    const allEvolutions = choices.every((choice) => choice.kind === 'evolution');
    const angles = rewardChoiceAngles(choices.length, allEvolutions);
    for (let i = 0; i < choices.length; i++) {
      const choice = choices[i];
      const deg = angles[i % angles.length];
      const rad = (deg * Math.PI) / 180;
      const x = cx + Math.cos(rad) * LEVELUP.itemRadius;
      const y = cy + Math.sin(rad) * LEVELUP.itemRadius;
      const labelSide = Math.cos(rad) > 0.4 ? 'left' as const : Math.cos(rad) < -0.4 ? 'right' as const : 'center' as const;
      items.push({ x, y, choice });
      if (choice.kind === 'weapon') {
        const prevTier = w.tiers.get(choice.role) ?? 0;
        payload.push({
          x, y, color: KIT_COLORS[choice.role],
          icon: { kind: 'weapon', role: choice.role },
          name: kits.get(choice.role)!.name,
          detail: prevTier > 0 ? `${prevTier} → ${choice.tier}` : '1',
          rarity: 'normal',
          labelSide,
        });
      } else if (choice.kind === 'gear') {
        const conf = GEARS[choice.gear];
        payload.push({
          x, y, color: conf.color,
          icon: { kind: 'gear', gear: conf.id },
          name: conf.name,
          detail: conf.pickLine,
          rarity: 'normal',
          labelSide,
        });
      } else {
        const conf = EVOLUTION_BY_ROLE.get(choice.role)!;
        payload.push({
          x, y, color: conf.color,
          icon: { kind: 'weapon', role: choice.role },
          name: `${ROLE_META[choice.role].name} → ${conf.name}`,
          detail: `EVOLVE · ${conf.pickLine}`,
          rarity: 'evolution',
          labelSide,
        });
      }
    }
    groundPicks = items;
    view?.setGroundPicks(payload);
    w.shoveEnemiesOut(cx, cy, LEVELUP.enemyPushRadius);
    if (levelMoment) startRewardMoment(cx, cy, 0x59ffd1, true);
  }

  /** The satisfying beat: slowScale slow-mo + weapon-volume duck for up to
   *  momentS, plus a bright cue and a screen pulse. Everything snaps back when
   *  the player collects a pick, or when momentS elapses, whichever is first. */
  function startRewardMoment(cx: number, cy: number, color: number, playCue: boolean): void {
    momentT = LEVELUP.momentS;
    momentScale = LEVELUP.slowScale;
    applyClockRate();
    engine.duckWeapons(LEVELUP.duckDepth, LEVELUP.momentS);
    if (playCue) engine.playLevelCue();
    const cssColor = `#${color.toString(16).padStart(6, '0')}`;
    hud.levelPulse(cssColor);
    view?.levelBurst(cx, cy, color);
  }

  function choiceStillValid(choice: GroundChoice, w: RunWorld): boolean {
    if (choice.kind === 'gear') {
      return canOwnGear(choice.gear, w.tiers, w.gear, w.timeS, GEAR_CAPACITY);
    }
    if (choice.kind === 'evolution') {
      return canEvolve(choice.role, w.tiers, w.gear, w.evolved);
    }
    const current = w.tiers.get(choice.role) ?? 0;
    if (choice.tier !== current + 1) return false;
    if (current > 0) return true;
    return ownerOfSlot(slotOf(choice.role), w.tiers) === undefined;
  }

  function collectGroundPick(item: GroundItem): void {
    const w = world;
    if (!w) return;
    endLevelMoment();
    const choice = item.choice;
    clearGroundPicks();
    if (!choiceStillValid(choice, w)) {
      // Keep activeReward intact; the next frame re-evaluates/rerolls it.
      hud.showToast('build changed — reward refreshed');
      return;
    }
    scheduleChoice(choice);
  }

  function scheduleChoice(choice: GroundChoice): void {
    const w = world;
    if (!w || !activeReward) return;
    choiceAwaitingBar = true;
    if (choice.kind === 'gear') pendingGear.add(choice.gear);
    if (choice.kind === 'gear') pendingGearTargets.set(choice.gear, true);
    if (choice.kind === 'evolution') pendingEvolutions.add(choice.role);
    paintBand();
    const generation = rewardGeneration;
    engine.atNextBar((barAudioTime) => {
      if (world !== w || !rewardStateLive() || generation !== rewardGeneration) return;
      if (!choiceStillValid(choice, w)) {
        engine.atAudioTime(barAudioTime, () => {
          if (world !== w || !rewardStateLive() || generation !== rewardGeneration) return;
          if (choice.kind === 'gear') pendingGear.delete(choice.gear);
          if (choice.kind === 'gear') pendingGearTargets.delete(choice.gear);
          if (choice.kind === 'evolution') pendingEvolutions.delete(choice.role);
          choiceAwaitingBar = false;
          paintBand();
        });
        return;
      }
      if (choice.kind === 'weapon') {
        engine.setVoiceTier(choice.role, choice.tier);
        if (!deactivatedRoles.has(choice.role)) engine.setVoiceEnabled(choice.role, true);
      } else if (choice.kind === 'evolution') {
        engine.setVoiceTier(choice.role, 4);
        engine.setVoiceEvolved(choice.role, true);
      }
      engine.atAudioTime(barAudioTime, () => {
        if (world !== w || !rewardStateLive() || generation !== rewardGeneration) return;
        if (!choiceStillValid(choice, w)) {
          if (choice.kind === 'weapon') {
            const currentTier = w.tiers.get(choice.role);
            if (currentTier) engine.setVoiceTier(choice.role, currentTier);
            else engine.setVoiceEnabled(choice.role, false);
          } else if (choice.kind === 'evolution') {
            engine.setVoiceEvolved(choice.role, w.evolved.has(choice.role));
          }
          if (choice.kind === 'gear') {
            pendingGear.delete(choice.gear);
            pendingGearTargets.delete(choice.gear);
          }
          if (choice.kind === 'evolution') pendingEvolutions.delete(choice.role);
          choiceAwaitingBar = false;
          paintBand();
          return;
        }
        if (choice.kind === 'weapon') w.addWeapon(choice.role, choice.tier);
        else if (choice.kind === 'gear') {
          w.addGear(choice.gear);
          pendingGear.delete(choice.gear);
          pendingGearTargets.delete(choice.gear);
          hud.showToast(`${GEARS[choice.gear].name} equipped`);
        } else {
          w.setEvolved(choice.role, true);
          w.setWeaponActive(choice.role, !deactivatedRoles.has(choice.role));
          pendingEvolutions.delete(choice.role);
          hud.showToast(`${ROLE_META[choice.role].name} → ${EVOLUTION_BY_ROLE.get(choice.role)!.name}`);
        }
        paintBand();
        view?.flourish(w.player.x, w.player.y);
        choiceAwaitingBar = false;
        completeRewardImmediately();
        presentQueuedRewardAtAudioT = barAudioTime;
      });
    });
  }

  const events = {
    onLevelUp(level: number): void {
      enqueueReward({ kind: 'level', level });
    },
    onChestCollected(): void {
      enqueueReward({ kind: 'chest' });
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
    onChestCollected(): void {
      enqueueReward({ kind: 'chest' });
    },
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
    resetRewardQueue();
    sandboxBuildGeneration++;
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
    resetDeactivations(); // new run starts with every instrument active
    engine.clearBarQueue();
    for (const role of ROLES) {
      engine.setVoiceEnabled(role, false);
      engine.setVoiceEvolved(role, false);
    }
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
    hud.renderBand(w.tiers, undefined, undefined, undefined, w.evolved, pendingEvolutions);
    hud.renderGear(w.gear, pendingGear);
    state = 'run';
    syncTimeScaleControl(); // arm the timeScale slider for the live run
    void engine.ctx.resume();
    engine.clock.start();
  }

  function projectedGearCount(w: RunWorld): number {
    let count = w.gear.size;
    for (const [gear, target] of pendingGearTargets) {
      if (target && !w.gear.has(gear)) count++;
      else if (!target && w.gear.has(gear)) count--;
    }
    return count;
  }

  function scheduleSandboxGear(gear: GearId, on: boolean): void {
    const w = world;
    if (!w || state !== 'sandbox' || pendingGear.has(gear)) return;
    const conf = GEARS[gear];
    if (on && !w.gear.has(gear) && projectedGearCount(w) >= GEAR_CAPACITY) {
      hud.showToast('four Gear sockets full — clear one first');
      return;
    }
    if (!on && w.evolved.has(conf.role)) {
      hud.showToast(`return ${EVOLUTION_BY_ROLE.get(conf.role)!.name} to base first`);
      return;
    }
    pendingGear.add(gear);
    pendingGearTargets.set(gear, on);
    paintBand();
    const generation = sandboxBuildGeneration;
    engine.atNextBar((barAudioTime) => {
      if (world !== w || state !== 'sandbox' || generation !== sandboxBuildGeneration) return;
      engine.atAudioTime(barAudioTime, () => {
        if (world !== w || state !== 'sandbox' || generation !== sandboxBuildGeneration) return;
        if (on && !w.gear.has(gear) && w.gear.size >= GEAR_CAPACITY) {
          pendingGear.delete(gear);
          pendingGearTargets.delete(gear);
          hud.showToast('four Gear sockets full — change cancelled');
          paintBand();
          sandboxPanel?.refresh();
          return;
        }
        if (on) w.addGear(gear);
        else w.removeGear(gear);
        pendingGear.delete(gear);
        pendingGearTargets.delete(gear);
        paintBand();
        sandboxPanel?.refresh();
      });
    });
  }

  function scheduleSandboxEvolution(role: Role, on: boolean): void {
    const w = world;
    const evolution = EVOLUTION_BY_ROLE.get(role);
    if (!w || state !== 'sandbox' || !evolution || pendingEvolutions.has(role)) return;
    if (on && pendingGearTargets.get(evolution.gear) === false) {
      hud.showToast('wait for the paired Gear removal first');
      return;
    }
    const needsGear = on && !w.gear.has(evolution.gear) && pendingGearTargets.get(evolution.gear) !== true;
    if (needsGear && projectedGearCount(w) >= GEAR_CAPACITY) {
      hud.showToast('four Gear sockets full — clear one first');
      return;
    }
    pendingEvolutions.add(role);
    if (needsGear) pendingGear.add(evolution.gear);
    if (needsGear) pendingGearTargets.set(evolution.gear, true);
    paintBand();
    sandboxPanel?.refresh();
    const generation = sandboxBuildGeneration;
    engine.atNextBar((barAudioTime) => {
      if (world !== w || state !== 'sandbox' || generation !== sandboxBuildGeneration) return;
      engine.setVoiceTier(role, 4);
      engine.setVoiceEvolved(role, on);
      if (!deactivatedRoles.has(role)) engine.setVoiceEnabled(role, true);
      engine.atAudioTime(barAudioTime, () => {
        if (world !== w || state !== 'sandbox' || generation !== sandboxBuildGeneration) return;
        if (on && !needsGear && !w.gear.has(evolution.gear)) {
          engine.setVoiceEvolved(role, w.evolved.has(role));
          pendingEvolutions.delete(role);
          hud.showToast('paired Gear missing — evolution cancelled');
          paintBand();
          sandboxPanel?.refresh();
          return;
        }
        if (needsGear && !w.gear.has(evolution.gear) && w.gear.size >= GEAR_CAPACITY) {
          engine.setVoiceEvolved(role, w.evolved.has(role));
          pendingEvolutions.delete(role);
          pendingGear.delete(evolution.gear);
          pendingGearTargets.delete(evolution.gear);
          hud.showToast('four Gear sockets full — evolution cancelled');
          paintBand();
          sandboxPanel?.refresh();
          return;
        }
        w.addWeapon(role, 4);
        if (needsGear) w.addGear(evolution.gear);
        w.setEvolved(role, on);
        w.setWeaponActive(role, on && !deactivatedRoles.has(role));
        pendingEvolutions.delete(role);
        if (needsGear) pendingGear.delete(evolution.gear);
        if (needsGear) pendingGearTargets.delete(evolution.gear);
        paintBand();
        sandboxPanel?.refresh();
      });
    });
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
        paintBand();
      },
      onToggleGear: (gear, on) => scheduleSandboxGear(gear, on),
      onSetEvolution: (role, on) => scheduleSandboxEvolution(role, on),
      onSpawnChest: () => {
        w.spawnChest(w.player.x + 100, w.player.y);
        sandboxPanel?.refresh();
      },
      onEnqueueChest: () => enqueueReward({ kind: 'chest' }),
      onClearRewards: () => {
        sandboxBuildGeneration++;
        resetRewardQueue();
        w.clearChests();
        paintBand();
      },
      rewardQueueLength,
      isGearPending: (gear) => pendingGear.has(gear),
      isEvolutionPending: (role) => pendingEvolutions.has(role),
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
    hud.renderBand(w.tiers, undefined, undefined, undefined, w.evolved, pendingEvolutions);
    hud.renderGear(w.gear, pendingGear);
    state = 'sandbox';
    syncTimeScaleControl(); // arm the timeScale slider for the sandbox
    void engine.ctx.resume();
    engine.clock.start();
  }

  function endRun(victory: boolean): void {
    if (!world || state === 'end') return;
    world.clearChests();
    state = 'end';
    syncTimeScaleControl(); // no live world to scale on the end screen
    const evolvedAtEnd = new Set(world.evolved);
    resetRewardQueue();
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
        evolved: evolvedAtEnd,
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
    trackOverlay.refresh(
      world?.tiers ?? new Map(),
      deactivatedRoles,
      pendingRoles,
      world?.evolved,
      pendingEvolutions,
    );
  }
  function toggleChartOverlay(): void {
    const show = trackOverlayEl.style.display === 'none';
    trackOverlayEl.style.display = show ? '' : 'none';
    if (show) refreshTrackOverlay();
  }

  // Number-key instrument toggles (dev mechanism): Digit1..Digit7 map to the
  // seven band slots in rack order and activate/deactivate the instrument owning
  // that slot, quantized to the next heard bar. Deactivation flips the voice's
  // `enabled` flag: a disabled voice generates no triggers, so its sound AND its
  // damage stop together because live damage rides the engine's triggers.
  //
  // deactivatedRoles = the settled off-state (dim). pendingRoles = a change is
  // scheduled but has not reached its bar yet (pulse). A pending role is always
  // heading to the OPPOSITE of its settled state, so the two sets fully describe
  // where each slot is and where it is going.
  const deactivatedRoles = new Set<Role>();
  const pendingRoles = new Set<Role>();
  function paintBand(): void {
    if (!world) return;
    hud.renderBand(
      world.tiers,
      undefined,
      deactivatedRoles,
      pendingRoles,
      world.evolved,
      pendingEvolutions,
    );
    hud.renderGear(world.gear, pendingGear);
    // The pause menu mirrors the same rack; keep it truthful if it's open.
    if (paused) {
      hud.renderBand(
        world.tiers,
        pauseRack,
        deactivatedRoles,
        pendingRoles,
        world.evolved,
        pendingEvolutions,
      );
      hud.renderGear(world.gear, pendingGear, pauseGear, true);
    }
    refreshTrackOverlay();
  }
  function toggleRoleActive(role: Role): void {
    if (pendingRoles.has(role)) {
      // Second press before the bar: cancel the scheduled change (round-trip).
      // The already-queued callback stays in the bar queue but no-ops, because
      // it re-checks pendingRoles before applying.
      pendingRoles.delete(role);
      paintBand();
      return;
    }
    const w = world;
    if (!w) return;
    // A pending change always flips the settled state (round-trips self-cancel
    // above), so the target is fixed at schedule time.
    const willDeactivate = !deactivatedRoles.has(role);
    pendingRoles.add(role);
    engine.atNextBar(() => {
      // The run ended or the world swapped: drop it silently.
      if (world !== w || (state !== 'run' && state !== 'sandbox')) {
        pendingRoles.delete(role);
        return;
      }
      if (!pendingRoles.has(role)) return; // cancelled by a round-trip press
      pendingRoles.delete(role);
      if (willDeactivate) {
        deactivatedRoles.add(role);
        engine.setVoiceEnabled(role, false);
      } else {
        deactivatedRoles.delete(role);
        engine.setVoiceEnabled(role, true);
      }
      w.setWeaponActive(role, !willDeactivate);
      paintBand();
    });
    paintBand();
  }
  function resetDeactivations(): void {
    // resetWorld disables every voice right after this, so re-enabling is
    // belt-and-suspenders; clearing both sets is the part that matters.
    for (const role of deactivatedRoles) engine.setVoiceEnabled(role, true);
    deactivatedRoles.clear();
    pendingRoles.clear();
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
        presentQueuedRewardAtAudioT !== null &&
        engine.ctx.currentTime >= presentQueuedRewardAtAudioT &&
        steps > 0 &&
        world === w &&
        rewardStateLive()
      ) {
        presentQueuedRewardAtAudioT = null;
        presentNextReward();
      }
      // XP and chest callbacks are raised inside RunWorld.update(). Present only
      // after the full fixed step survived, so same-frame rewards retain FIFO.
      if (steps > 0 && world === w && rewardStateLive()) presentNextReward();
      // Walk-onto collection of a dropped level-up item — a FIXED range, so a
      // future pickup-range buff never reaches it. Checked after stepping so
      // the player's fresh position is used; at most one taken per frame.
      if (groundPicks.length > 0 && world === w && rewardStateLive()) {
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
    // Number-key instrument toggles are live only in a run or sandbox.
    if (/^Digit[1-7]$/.test(e.code) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if ((state === 'run' || state === 'sandbox') && world) {
        const slot = SLOTS[Number(e.code.slice(5)) - 1];
        const role = ownerOfSlot(slot, world.tiers);
        if (role) toggleRoleActive(role); // empty slot: the key does nothing
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
