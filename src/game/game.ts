// The game shell: Pixi app, run states, and the wiring between the music
// engine and the world. The engine stays a pure function of build and grid;
// the game only listens to its triggers and toggles voices on picks.

import { Application } from 'pixi.js';
import type { MusicEngine } from '../audio/engine';
import { SOUNDSET } from '../audio/soundset';
import { ROLES, type Kit, type Role } from '../audio/kits';
import { LEVELUP } from './config';
import { SLOTS, ownerOfSlot } from './band';
import { mountTrackOverlay } from './trackoverlay';
import { Hud } from './hud';
import { pushDamageFeedback } from './damage-feedback';
import { createGreedyMover, createKiter, type AutoMover } from './auto-move';
import { autoMove, Input, type AutoMoveMode } from './input';
import { mountJoystick } from './joystick';
import { rollOffers, rollStartingWeapons, type AnyPickOption } from './picks';
import { RunWorld, KIT_COLORS, type VacuumResult } from './run';
import { SIM_DT } from './timing';
import { preloadRunArt, RunView, type GroundPickView } from './view';
import { mountSandboxPanel, type SandboxPanel } from './sandbox';
import { ITEMS, type EvolutionDefinition } from './items';
import { MetaStore, type RunSettlement } from './meta';
import { VENUE_AUDIO_SET } from '../audio/venue-audio';
import { VENUE_IDS, isVenueId } from './tour';
import { mulberry32 } from './rng';

type State = 'start' | 'run' | 'end' | 'sandbox';

export async function bootGame(
  root: HTMLElement,
  engine: MusicEngine,
  kits: Map<Role, Kit>,
): Promise<void> {
  await preloadRunArt();
  const app = new Application();
  await app.init({
    background: 0x080a12,
    resizeTo: window,
    antialias: false,
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
  const meta = new MetaStore();
  const input = new Input();
  let state: State = 'start';
  let world: RunWorld | null = null;
  let view: RunView | null = null;
  let muted = false;
  let paused = false;
  let lastWarningMinute = -1;

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
  // ESC resumes. Both playable arenas pause; menu screens do not.
  const pauseOverlay = document.createElement('div');
  pauseOverlay.className = 'screen pause-overlay';
  pauseOverlay.style.display = 'none';
  pauseOverlay.innerHTML =
    '<h1>Paused</h1><div class="pause-rack"></div><div class="pause-items"></div><button class="pause-resume">RESUME SET</button><p class="hint">Escape also resumes.</p>';
  root.appendChild(pauseOverlay);
  const pauseRack = pauseOverlay.querySelector('.pause-rack') as HTMLElement;
  const pauseItems = pauseOverlay.querySelector('.pause-items') as HTMLElement;
  const resumeButton = pauseOverlay.querySelector('.pause-resume') as HTMLButtonElement;
  const pauseButton = document.createElement('button');
  pauseButton.className = 'pause-live';
  pauseButton.textContent = 'PAUSE';
  pauseButton.setAttribute('aria-label', 'Pause the set');
  pauseButton.style.display = 'none';
  root.appendChild(pauseButton);
  function togglePause(): void {
    if (state !== 'run' && state !== 'sandbox') return;
    paused = !paused;
    pauseOverlay.style.display = paused ? '' : 'none';
    pauseButton.textContent = paused ? 'RESUME' : 'PAUSE';
    pauseButton.setAttribute('aria-label', paused ? 'Resume the set' : 'Pause the set');
    if (paused) {
      engine.clock.pause();
      engine.holdTransport();
      // Show the current band while paused (the same rack the HUD draws).
      if (world) {
        hud.renderBand(world.tiers, pauseRack, deactivatedRoles, pendingRoles, world.evolved);
        hud.renderItemDetails(world.items, pauseItems);
      }
    } else {
      engine.releaseTransport();
      engine.clock.resume();
    }
  }
  pauseButton.onclick = togglePause;
  resumeButton.onclick = togglePause;

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
  const pendingEvolutionChoices: EvolutionDefinition[][] = [];
  let pickAwaitingBar = false;
  let presentQueuedPickAtAudioT: number | null = null;
  let rerollsLeft = 0;
  // The level-up offers currently dropped on the ground as physical items, in
  // a triangle around the player. Shell-owned (never entities in the
  // simulation), so it stays independent from world entities. Empty = none.
  type EvolutionPick = { kind: 'evolution'; evolution: EvolutionDefinition };
  type ShellPick = AnyPickOption | EvolutionPick;
  interface GroundItem {
    x: number;
    y: number;
    option: ShellPick;
  }
  let groundPicks: GroundItem[] = [];
  // True while the run's opening weapon choice is the triangle on the ground.
  // That pick is committed: it must never spend a purchased reroll.
  let openingPickOut = false;

  function clearGroundPicks(): void {
    if (groundPicks.length > 0) groundPicks = [];
    openingPickOut = false;
    view?.setGroundPicks([]);
  }

  function resetUpgradeQueue(): void {
    pendingUpgrades.length = 0;
    pendingEvolutionChoices.length = 0;
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
    if (pendingEvolutionChoices.length > 0) {
      const eligibleNow = new Set(w.eligibleEvolutions().map(({ role }) => role));
      const evolutionOptions = pendingEvolutionChoices.shift()!
        .filter(({ role }) => eligibleNow.has(role))
        .slice(0, 3)
        .map((evolution): EvolutionPick => ({ kind: 'evolution', evolution }));
      if (evolutionOptions.length > 0) dropGroundPicks(w, evolutionOptions);
      else presentNextUpgrade();
      return;
    }
    // Build-complete rewards have no item to drop and resolve to the heal
    // fallback immediately; the first real offer drops a triangle and stops.
    while (pendingUpgrades.length > 0 && groundPicks.length === 0) {
      pendingUpgrades.shift();
      // Roll the real three-option offer for this reward.
      const options = rollOffers({
        tiers: w.tiers,
        items: w.items,
        unlockedRoles: meta.unlockedRoles(),
        unlockedItems: meta.unlockedItemIds(),
        rng: Math.random,
        timeS: w.timeS,
        level: w.level,
        encore: w.encoreProgress,
      });
      dropGroundPicks(w, options);
    }
  }

  /** Drop the offered options as items in a triangle around the player, shove
   *  the horde clear of them, and fire the cosmetic level-up moment. Pass
   *  celebrate=false for a drop that is not a reward (the opening hire): the
   *  pedestals still appear and the horde is still cleared, but nothing claims
   *  the player gained a level. */
  function dropGroundPicks(w: RunWorld, options: ShellPick[], celebrate = true): void {
    const cx = w.player.x;
    const cy = w.player.y;
    const items: GroundItem[] = [];
    const payload: GroundPickView[] = [];
    for (let i = 0; i < options.length; i++) {
      const option = options[i];
      const deg = LEVELUP.angles[i % LEVELUP.angles.length];
      const rad = (deg * Math.PI) / 180;
      // Portrait screens have less visible world width than the authored
      // triangle. Clamp the horizontal offset far enough inside the camera for
      // the 168-unit name/effect plate to stay fully readable, while retaining
      // more than the fixed 40-unit walk-to-collect distance.
      const horizontalRoom = Math.max(LEVELUP.itemPickupRadius + 4, w.worldW / 2 - 92);
      const x = cx + Math.max(-horizontalRoom, Math.min(horizontalRoom, Math.cos(rad) * LEVELUP.itemRadius));
      const y = cy + Math.sin(rad) * LEVELUP.itemRadius;
      items.push({ x, y, option });
      if (option.kind === 'weapon') {
        const prevTier = w.tiers.get(option.role) ?? 0;
        payload.push({ x, y, role: option.role, color: KIT_COLORS[option.role],
          name: kits.get(option.role)!.name, level: prevTier > 0 ? `${prevTier} → ${option.tier}` : '1' });
      } else if (option.kind === 'item') {
        const definition = ITEMS[option.item];
        const previous = w.items.get(option.item) ?? 0;
        payload.push({ x, y, glyph: definition.glyph, color: definition.color,
          name: definition.name, level: previous > 0 ? `${previous} → ${option.tier}` : '1',
          effect: definition.levelLines[option.tier - 1] });
      } else if (option.kind === 'encore') {
        const role: Role = option.encore === 'heal' ? 'clap' : option.encore === 'damage' ? 'bass' : option.encore === 'move' ? 'kick' : 'chord';
        const label = option.encore === 'heal' ? 'Emergency Water' : option.encore === 'damage' ? 'Hotter Signal' : option.encore === 'move' ? 'Quick Change' : 'Wider Stage';
        payload.push({ x, y, role, color: KIT_COLORS[role], name: label,
          level: option.encore === 'heal' ? '+15 HP' : `+${option.amount}%` });
      } else {
        payload.push({ x, y, role: option.evolution.role, color: option.evolution.color,
          name: option.evolution.name, level: 'EVOLVE' });
      }
    }
    groundPicks = items;
    view?.setGroundPicks(payload);
    w.shoveEnemiesOut(cx, cy, LEVELUP.enemyPushRadius);
    // No slow-mo, no mix duck, no level cue and no HUD pulse for the opening
    // hire — only the burst that reads as "here are your options".
    if (celebrate) startLevelMoment(cx, cy);
    else view?.levelBurst(cx, cy);
  }

  /** The satisfying beat: normally slowScale slow-mo + a short mix dip. An
   * earned or live Pressure Drop keeps full momentum, so a reward arriving in
   * the scheduler's lookahead window cannot weaken the opening downbeat. */
  function startLevelMoment(cx: number, cy: number): void {
    if (world?.pressureState === 'armed' || world?.pressureState === 'drop') {
      endLevelMoment();
      engine.restoreWeapons(0.025);
    } else {
      momentT = LEVELUP.momentS;
      momentScale = LEVELUP.slowScale;
      applyClockRate();
      engine.duckWeapons(LEVELUP.duckDepth, LEVELUP.momentS);
    }
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
    if (option.kind === 'item') {
      w.addItem(option.item, option.tier);
      const definition = ITEMS[option.item];
      hud.showToast(`${definition.name} ${option.tier} · ${definition.levelLines[option.tier - 1]}`);
      hud.levelPulse();
      view?.flourish(w.player.x, w.player.y);
      presentNextUpgrade();
      return;
    }
    if (option.kind === 'encore') {
      w.applyEncoreChoice(option.encore);
      hud.showToast(option.encore === 'heal' ? '+15 HP' : `Encore ${option.encore} +${option.amount}%`);
      hud.levelPulse();
      view?.flourish(w.player.x, w.player.y);
      presentNextUpgrade();
      return;
    }
    pickAwaitingBar = true;
    engine.atNextBar((barAudioTime) => {
      if (world !== w || state !== 'run') return;
      // Audio is scheduled ahead, so its chart must change now for the first
      // note of the new bar. World state waits for the exact heard timestamp
      // below, preserving old-tier damage on any older trigger.
      if (option.kind === 'weapon') engine.setVoiceTier(option.role, option.tier);
      else {
        const stillEligible = w.eligibleEvolutions().some(({ role }) => role === option.evolution.role);
        if (!stillEligible) {
          pickAwaitingBar = false;
          presentNextUpgrade();
          return;
        }
        engine.setEvolutionGain(option.evolution.role, option.evolution.gainDb);
      }
      // Sticky deactivation: a tier-up applies the new tier but does not revive
      // an instrument the developer deliberately turned off. It returns at the
      // higher tier when reactivated.
      if (option.kind === 'weapon' && !deactivatedRoles.has(option.role)) engine.setVoiceEnabled(option.role, true);
      engine.atAudioTime(barAudioTime, () => {
        if (world !== w || state !== 'run') return;
        if (option.kind === 'weapon') w.addWeapon(option.role, option.tier);
        else w.evolve(option.evolution.role);
        hud.renderBand(w.tiers, undefined, deactivatedRoles, pendingRoles, w.evolved);
        refreshTrackOverlay();
        view?.flourish(w.player.x, w.player.y);
        pickAwaitingBar = false;
        // Wait until this bar's due gameplay triggers have been consumed by one
        // fixed world step before dropping a stacked reward's triangle.
        presentQueuedPickAtAudioT = barAudioTime;
      });
    });
  }

  function rerollGroundOffers(): void {
    const w = world;
    if (!w || state !== 'run' || rerollsLeft <= 0 || groundPicks.length === 0) return;
    if (openingPickOut) {
      // Rerolls are a purchased meta resource for in-run level-ups. The run's
      // opening instrument is a committed choice and never spends one.
      hud.showToast('The opening hire cannot be rerolled');
      return;
    }
    if (groundPicks.some((pick) => pick.option.kind === 'evolution')) {
      hud.showToast('Encore Cases cannot be rerolled');
      return;
    }
    rerollsLeft -= 1;
    clearGroundPicks();
    const options = rollOffers({
      tiers: w.tiers,
      items: w.items,
      unlockedRoles: meta.unlockedRoles(),
      unlockedItems: meta.unlockedItemIds(),
      rng: Math.random,
      timeS: w.timeS,
      level: w.level,
      encore: w.encoreProgress,
    });
    dropGroundPicks(w, options);
    hud.showToast(`REROLL · ${rerollsLeft} left`);
  }
  hud.setRerollAction(rerollGroundOffers);

  const updateArenaMinute = (minute: number): void => {
    engine.clock.bpm = SOUNDSET.bpm * (1 + Math.min(0.08, minute * 0.002));
    if (minute > 0) hud.showToast(`PRESSURE ${minute} · enemies scale up`);
  };

  const updateArenaVenue = (venue: string): void => {
    const id = isVenueId(venue) ? venue : 'alley';
    void engine.setAudioSet(VENUE_AUDIO_SET[id]);
    hud.showToast(`NEW VENUE · ${venue.replace(/\b\w/g, (letter) => letter.toUpperCase())}`);
  };

  /** One Pressure Drop conductor for the run and Sandbox. Full pressure waits
   * without a penalty, then the positive buff spans exactly one heard phrase:
   * actions precede same-time weapon triggers at bars 1-4 and at the exit. */
  const schedulePressureDrop = (w: RunWorld, arena: 'run' | 'sandbox'): void => {
    const conductorToken = w.newPressureConductor();
    const conductorIsLive = (): boolean =>
      world === w && state === arena && w.pressureConductorIsCurrent(conductorToken);
    hud.showToast('PRESSURE FULL · DROP ON NEXT PHRASE');
    engine.atNextPhrase((startAudioTime) => {
      if (!conductorIsLive()) return;
      // The scheduler is looking ahead. Restore tempo/mix now so the first
      // Drop downbeat itself cannot be pre-scheduled through a reward dip.
      endLevelMoment();
      engine.restoreWeapons(0.025);
      engine.setPressureDropLift(true, startAudioTime);
      engine.playPressureDropBar(1, startAudioTime);
      engine.atAudioTime(startAudioTime, () => {
        if (!conductorIsLive()) return;
        // Defend the heard boundary too: any later UI path that introduced a
        // transient duck after lookahead scheduling is canceled at impact.
        endLevelMoment();
        engine.restoreWeapons(0.025);
        w.beginPressureDrop();
        w.pulsePressureDropBar(1);
      });

      const queueBarPulse = (bar: number): void => {
        engine.atNextBar((barAudioTime) => {
          if (
            !conductorIsLive() ||
            (w.pressureState !== 'armed' && w.pressureState !== 'drop')
          ) return;
          // A delayed scheduler may catch up past several grid lines. Advance
          // world state in timestamp order, but never pile missed accents onto
          // the first audible instant after the stall.
          if (barAudioTime > engine.ctx.currentTime + 1e-6) {
            engine.playPressureDropBar(bar, barAudioTime);
          }
          engine.atAudioTime(barAudioTime, () => {
            if (!conductorIsLive() || w.pressureState !== 'drop') return;
            w.pulsePressureDropBar(bar);
          });
          if (bar < 4) queueBarPulse(bar + 1);
        });
      };
      queueBarPulse(2);

      // Registered from inside the phrase-start flush, so this necessarily
      // lands on the following phrase boundary: exactly four complete bars.
      engine.atNextPhrase((finishAudioTime) => {
        if (!conductorIsLive()) return;
        engine.setPressureDropLift(false, finishAudioTime);
        engine.atAudioTime(finishAudioTime, () => {
          if (!conductorIsLive()) return;
          w.finishPressureDrop();
        });
      }, startAudioTime, true);
    });
  };

  const events = {
    onLevelUp(level: number): void {
      enqueueUpgrade(level);
    },
    onDeath(): void {
      endRun(false);
    },
    onVictory(): void {
      // Endless mode has no victory terminal; kept for the shared interface.
    },
    onHit(): void {
      pushDamageFeedback(hud.flashEl, view);
    },
    onMinute(minute: number): void {
      updateArenaMinute(minute);
    },
    onEncoreCase(): void {
      const w = world;
      if (!w || state !== 'run') return;
      const choices = w.eligibleEvolutions();
      if (choices.length === 0) {
        w.applyEncoreChoice('heal');
        hud.showToast('Encore Case · +15 HP (no recipe ready)');
        return;
      }
      pendingEvolutionChoices.push(choices);
      presentNextUpgrade();
    },
    onPressureArmed(): void {
      const w = world;
      if (!w) return;
      schedulePressureDrop(w, 'run');
    },
    onPressureBreak(active: boolean): void {
      hud.showToast(active
        ? 'DROP · DAMAGE +50% · AREA/SHOVE +25% · SHOT SPEED +20% · MOVE +15%'
        : 'DROP COMPLETE · RECHARGING');
    },
    onStageMagnet(result: VacuumResult): void {
      engine.playStageMagnetCue();
      const total = result.gems + result.notes;
      hud.showToast(total > 0
        ? `STAGE MAGNET · ${total} PICKUPS INBOUND`
        : 'STAGE MAGNET · FLOOR CLEAR');
    },
    onVenueChanged(venue: string): void {
      updateArenaVenue(venue);
    },
    onMilestone(id: string): void {
      hud.showToast(`MILESTONE · ${id.replace(/([A-Z])/g, ' $1').toUpperCase()}`);
    },
  };

  // Sandbox: same world, no stage script. Death just refills (the panel's
  // invulnerability toggle is the real control).
  const sandboxEvents = {
    onLevelUp(): void {},
    onDeath(): void {
      if (world) world.player.hp = world.playerMaxHp;
      hud.showToast('you would have died — hp refilled');
    },
    onVictory(): void {},
    onHit(): void {
      pushDamageFeedback(hud.flashEl, view);
    },
    onMinute(minute: number): void {
      updateArenaMinute(minute);
    },
    onEncoreCase(): void {
      const w = world;
      if (!w || state !== 'sandbox') return;
      const evolution = w.eligibleEvolutions()[0];
      if (!evolution) {
        w.applyEncoreChoice('heal');
        hud.showToast('Encore Case · +15 HP (no recipe ready)');
        return;
      }
      w.evolve(evolution.role);
      engine.setEvolutionGain(evolution.role, evolution.gainDb);
      hud.renderBand(w.tiers, undefined, undefined, undefined, w.evolved);
      hud.showToast(`EVOLVED · ${evolution.name}`);
    },
    onPressureArmed(): void {
      const w = world;
      if (w) schedulePressureDrop(w, 'sandbox');
    },
    onPressureBreak(active: boolean): void {
      hud.showToast(active
        ? 'DROP · DAMAGE +50% · AREA/SHOVE +25% · SHOT SPEED +20% · MOVE +15%'
        : 'DROP COMPLETE · RECHARGING');
    },
    onStageMagnet(result: VacuumResult): void {
      engine.playStageMagnetCue();
      const total = result.gems + result.notes;
      hud.showToast(total > 0
        ? `STAGE MAGNET · ${total} PICKUPS INBOUND`
        : 'STAGE MAGNET · FLOOR CLEAR');
    },
    onVenueChanged(venue: string): void {
      updateArenaVenue(venue);
    },
    onMilestone(id: string): void {
      hud.showToast(`MILESTONE · ${id.replace(/([A-Z])/g, ' $1').toUpperCase()}`);
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
    lastWarningMinute = -1;
    resetUpgradeQueue();
    liveAcc = 0;
    setTimeScale(1); // every new run or sandbox starts at normal speed
    syncTimeScaleControl(); // disabled until startRun/startSandbox re-enables it
    setAutoMode('off'); // manual by default; startRun re-arms it if chosen
    pauseOverlay.style.display = 'none';
    pauseButton.style.display = 'none';
    pauseButton.textContent = 'PAUSE';
    sandboxPanel?.destroy();
    sandboxPanel = null;
    view?.destroy();
    view = null;
    world = null;
    resetDeactivations(); // new run starts with every instrument active
    engine.clearBarQueue();
    engine.resetEvolutionMixes();
    for (const role of ROLES) engine.setVoiceEnabled(role, false);
  }

  function startRun(mode: AutoMoveMode = 'off'): void {
    resetWorld();
    // Auto-move hands movement to a kiter or gem-hungry greedy mode;
    // manual keeps the keyboard/joystick.
    // The seam reads playerControl live, so the in-game toggle works too.
    setAutoMode(mode);
    const w: RunWorld = new RunWorld(app.screen, events, {
      control: () => playerControl(w),
      startingItem: meta.state.startItem,
      unlockedVenues: meta.state.unlockedVenues,
      secondWind: meta.state.secondWind,
      headlinerGold: meta.hasGoldPalette(),
    });
    world = w;
    w.player.hp = w.playerMaxHp;
    rerollsLeft = meta.state.rerolls;
    w.powerMul = SOUNDSET.powerMul;
    view = new RunView(w, app.screen);
    app.stage.addChild(view.stage);
    void engine.setAudioSet('midnight-warehouse');
    hud.showHud(true);
    pauseButton.style.display = '';
    hud.renderBand(w.tiers, undefined, undefined, undefined, w.evolved);
    state = 'run';
    syncTimeScaleControl(); // arm the timeScale slider for the live run
    void engine.ctx.resume();
    engine.clock.start();
    // The run opens silent, on a choice of instrument rather than a fixed one.
    // Three weapon pedestals drop around the player and collectGroundPick arms
    // the chosen one on the next bar. This is deliberately NOT a level-up: no
    // upgrade is enqueued and world level/XP are untouched, so the HUD still
    // reads level 1 after the pick.
    dropGroundPicks(
      w,
      rollStartingWeapons({
        tiers: w.tiers,
        unlockedRoles: meta.unlockedRoles(),
        rng: Math.random,
        timeS: 0,
      }),
      false,
    );
    openingPickOut = true;
  }

  function startSandbox(): void {
    resetWorld();
    const w: RunWorld = new RunWorld(app.screen, sandboxEvents, {
      scripted: false,
      rng: mulberry32(0x5eed),
      control: () => playerControl(w),
      unlockedVenues: VENUE_IDS,
    });
    world = w;
    w.powerMul = SOUNDSET.powerMul;
    w.invincible = true;
    view = new RunView(w, app.screen);
    app.stage.addChild(view.stage);
    void engine.setAudioSet(VENUE_AUDIO_SET.alley);
    sandboxPanel = mountSandboxPanel(root, engine, w, {
      onLoadout: () => {
        hud.renderBand(w.tiers, undefined, deactivatedRoles, pendingRoles, w.evolved);
        refreshTrackOverlay();
      },
      onExit: () => {
        resetWorld();
        engine.clock.stop();
        hud.showHud(false);
        hud.showStart(startRun, startSandbox, meta);
        state = 'start';
        syncTimeScaleControl(); // resetWorld ran while still 'sandbox'; re-grey now
      },
    });
    hud.showHud(true, true);
    pauseButton.style.display = '';
    hud.renderBand(w.tiers, undefined, undefined, undefined, w.evolved);
    state = 'sandbox';
    syncTimeScaleControl(); // arm the timeScale slider for the sandbox
    void engine.ctx.resume();
    engine.clock.start();
  }

  function endRun(_victory = false): void {
    if (!world || state === 'end') return;
    state = 'end';
    syncTimeScaleControl(); // no live world to scale on the end screen
    resetUpgradeQueue();
    liveAcc = 0;
    applyGain();
    engine.clock.stop();
    engine.clearBarQueue();
    hud.showHud(false);
    pauseButton.style.display = 'none';
    const settlement: RunSettlement = meta.settleRun({
      timeS: world.timeS,
      level: world.level,
      kills: world.kills,
      notesCollected: world.notesCollected,
      headlinersKilled: world.headlinersKilled,
      evolutionsMade: world.evolutionsMade,
      milestones: [...world.milestones],
      damageByRole: world.damageByRole,
      killsByRole: world.killsByRole,
      evolutionsByRole: world.evolutionsByRole,
      venuesVisited: [...world.venuesVisited],
    });
    hud.showEnd(
      false,
      {
        timeS: world.timeS,
        kills: world.kills,
        level: world.level,
        notesCollected: world.notesCollected,
        damageByRole: world.damageByRole,
        killsByRole: world.killsByRole,
      },
      () => {
        hud.showHud(false);
        hud.showStart(startRun, startSandbox, meta);
        state = 'start';
      },
      settlement,
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
    trackOverlay.refresh(world?.tiers ?? new Map(), deactivatedRoles, pendingRoles);
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
    hud.renderBand(world.tiers, undefined, deactivatedRoles, pendingRoles, world.evolved);
    // The pause menu mirrors the same rack; keep it truthful if it's open.
    if (paused) {
      hud.renderBand(world.tiers, pauseRack, deactivatedRoles, pendingRoles, world.evolved);
      hud.renderItemDetails(world.items, pauseItems);
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
        w.player.hp / w.playerMaxHp,
        w.xpProgress(),
        w.level,
        w.timeS,
      );
      hud.setRunInfo(
        w.items,
        w.evolved,
        w.pressureHeat,
        w.pressureState,
        w.pressureDropBar,
        w.venue,
        w.venueChapter,
        rerollsLeft,
        w.notesCollected,
      );
      sandboxPanel?.update();
      const minute = Math.floor(w.timeS / 60);
      const second = w.timeS - minute * 60;
      if (state === 'run' && second >= 57 && lastWarningMinute !== minute) {
        lastWarningMinute = minute;
        hud.showToast('PRESSURE RISES IN 3');
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
  // on-screen buttons (developer tools)
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
    reroll: {
      label: 'reroll offer',
      hotkey: 'R',
      onClick: rerollGroundOffers,
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
      KeyR: debugActions.reroll,
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

  hud.showStart(startRun, startSandbox, meta);

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
