// The game shell: Pixi app, run states, and the wiring between the music
// engine and the world. The engine stays a pure function of build and grid;
// the game only listens to its triggers and toggles voices on picks.

import { Application } from 'pixi.js';
import type { MusicEngine } from '../audio/engine';
import {
  GAME_TRACKS,
  type GameTrackProfile,
} from '../audio/gameTracks';
import { SOUNDSET } from '../audio/soundset';
import { type Kit, type Role } from '../audio/kits';
import { SIM_DT, VirtualConductor } from '../bot/conductor';
import { MOVERS, type Mover, type MoverName } from '../bot/movers';
import { makePolicy } from '../bot/policies';
import { SIM_VIEW } from '../bot/sim';
import { SLOTS, SLOT_LABEL, supportedRoster, type Slot } from './band';
import { RUN } from './config';
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
  let activeTrack: GameTrackProfile | null = null;
  let trackLoadToken = 0;
  /** Choices accepted by the player but waiting for their next-bar musical
   *  entry. Surplus XP can open another pick before that bar, so offer rolls
   *  must treat these states as already owned just like the bot conductor. */
  const pendingPickTiers = new Map<Role, number>();
  const pendingTrackMutes = new Map<Slot, boolean>();
  const queuedTrackMutes = new Set<Slot>();

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
  pauseOverlay.className = 'pause-overlay';
  pauseOverlay.style.display = 'none';
  pauseOverlay.innerHTML =
    '<h1>Paused</h1><div class="track-deck pause-track-deck"></div>' +
    '<button class="pause-resume">resume</button><p class="hint">Press ESC or tap resume.</p>';
  root.appendChild(pauseOverlay);
  const pauseDeck = pauseOverlay.querySelector('.pause-track-deck') as HTMLElement;
  const pauseResume = pauseOverlay.querySelector('.pause-resume') as HTMLButtonElement;

  /** Every active role in one stable band slot. Normal runs have one; the
   *  sandbox may force several and the number/cell toggle treats them as a bus. */
  function activeTrackRoles(slot: Slot): Role[] {
    if (!world) return [];
    return supportedRoster(slot, activeTrack?.roles).filter(
      (role) => world!.tiers.has(role) && (engine.voices.get(role)?.enabled ?? false),
    );
  }

  function renderTrackDeck(): void {
    if (!world) return;
    hud.renderBand(world.tiers);
    if (paused) hud.renderBand(world.tiers, pauseDeck);
  }

  /** Queue an audio-monitor change on the next bar. The world and its attacks
   *  continue untouched; repeated presses before the boundary update or cancel
   *  the one pending state instead of stacking callbacks. */
  function toggleTrack(slotIndex: number): boolean {
    if ((state !== 'run' && state !== 'sandbox') || !world) return false;
    const slot = SLOTS[slotIndex];
    if (!slot) return false;
    const roles = activeTrackRoles(slot);
    if (roles.length === 0) return false;

    const currentlyMuted = roles.every((role) => engine.voiceMuted(role));
    const desired = !(pendingTrackMutes.get(slot) ?? currentlyMuted);
    const cancelled = desired === currentlyMuted;
    if (cancelled) pendingTrackMutes.delete(slot);
    else pendingTrackMutes.set(slot, desired);

    if (!queuedTrackMutes.has(slot)) {
      queuedTrackMutes.add(slot);
      const queuedWorld = world;
      engine.atNextBar(() => {
        queuedTrackMutes.delete(slot);
        const target = pendingTrackMutes.get(slot);
        pendingTrackMutes.delete(slot);
        if (
          target === undefined ||
          world !== queuedWorld ||
          (state !== 'run' && state !== 'sandbox')
        ) {
          renderTrackDeck();
          return;
        }
        for (const role of activeTrackRoles(slot)) engine.setVoiceMuted(role, target);
        renderTrackDeck();
      });
    }

    renderTrackDeck();
    hud.showToast(
      cancelled
        ? `${slotIndex + 1} · ${SLOT_LABEL[slot]} · change cancelled`
        : `${slotIndex + 1} · ${SLOT_LABEL[slot]} · audio ${desired ? 'off' : 'on'} next bar`,
    );
    return true;
  }

  hud.configureTrackDeck({
    isMuted: (role) => engine.voiceMuted(role),
    pendingMute: (slot) => pendingTrackMutes.get(slot),
    canToggle: () => state === 'run' || state === 'sandbox',
    onToggle: (slotIndex) => {
      toggleTrack(slotIndex);
    },
  });

  function togglePause(): void {
    if (state !== 'run') return;
    paused = !paused;
    pauseOverlay.style.display = paused ? '' : 'none';
    if (paused) {
      engine.clock.pause();
      renderTrackDeck();
    } else engine.clock.resume();
  }
  pauseResume.onclick = () => {
    if (paused) togglePause();
    pauseResume.blur();
  };

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
      const effectiveTiers = new Map(world!.tiers);
      for (const [role, tier] of pendingPickTiers) effectiveTiers.set(role, tier);
      const options = rollOffers(
        effectiveTiers,
        Math.random,
        world!.timeS,
        activeTrack?.roles,
      );
      if (options.length === 0) {
        hud.showToast('the track is complete');
        return;
      }
      state = 'pick';
      engine.clock.pause();
      hud.showPick(options, (option) => {
        state = 'run';
        pendingPickTiers.set(option.role, option.tier);
        // Musical entry rule: the old chart finishes its bar and the new voice
        // or tier enters on the following "1".
        const w = world;
        engine.atNextBar(() => {
          if ((state !== 'run' && state !== 'pick') || world !== w) return;
          engine.setVoiceTier(option.role, option.tier);
          engine.setVoiceEnabled(option.role, true);
          w!.addWeapon(option.role, option.tier);
          // A later queued tier of the same weapon supersedes this one in the
          // effective offer pool until its own next-bar callback lands.
          if (pendingPickTiers.get(option.role) === option.tier) {
            pendingPickTiers.delete(option.role);
          }
          renderTrackDeck();
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
    setAutoMode('off'); // manual by default; startRun re-arms it if chosen
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
    engine.cancelScheduled();
    pendingPickTiers.clear();
    pendingTrackMutes.clear();
    queuedTrackMutes.clear();
    engine.clearVoiceMutes();
    for (const role of engine.voices.keys()) engine.setVoiceEnabled(role, false);
  }

  /** Load one explicit profile and refresh every UI label from the kit map the
   *  engine actually applied. A token keeps rapid sandbox switches from
   *  reviving an older selection after its async sample build completes. */
  async function applyTrack(profile: GameTrackProfile): Promise<boolean> {
    const token = ++trackLoadToken;
    hud.showToast(`building ${profile.title}…`);
    try {
      const trackKits = await engine.setGameTrack(profile);
      if (token !== trackLoadToken || !trackKits) return false;
      activeTrack = profile;
      hud.setTrackContext(profile.title, profile.roles, trackKits);
      return true;
    } catch (error) {
      if (token !== trackLoadToken) return false;
      console.error(`[game] failed to load ${profile.id}:`, error);
      hud.showToast(`could not load ${profile.title}`);
      hud.showHud(false);
      hud.showStart(GAME_TRACKS, startRun, startSandbox);
      state = 'start';
      return false;
    }
  }

  function weaponDamageMuls(
    profile: GameTrackProfile,
  ): Partial<Record<Role, number>> {
    return Object.fromEntries(
      profile.weapons.map((weapon) => [weapon.role, weapon.damageMul]),
    ) as Partial<Record<Role, number>>;
  }

  async function startRun(
    profile: GameTrackProfile,
    startingKit: Role,
    mode: AutoMoveMode = 'off',
  ): Promise<void> {
    engine.clock.stop();
    resetWorld();
    hud.showHud(false);
    if (!(await applyTrack(profile))) return;
    // Auto-move hands the player's movement to a bot mover (kiter = survival,
    // greedy = the gem-hungry harvester); manual keeps the keyboard/joystick.
    // The seam reads playerControl live, so the in-game toggle works too.
    setAutoMode(mode);
    const w: RunWorld = new RunWorld(app.screen, events, {
      control: () => playerControl(w),
      maxBuildLevel: profile.maxBuildLevel,
      xpThresholdMul: profile.xpMul,
      weaponDamageMul: weaponDamageMuls(profile),
    });
    world = w;
    w.powerMul = profile.powerMul;
    view = new RunView(w, app.screen);
    app.stage.addChild(view.stage);
    engine.setVoiceTier(startingKit, 1);
    engine.setVoiceEnabled(startingKit, true);
    w.addWeapon(startingKit, 1);
    state = 'run';
    hud.showHud(true);
    renderTrackDeck();
    void engine.ctx.resume();
    engine.clock.start();
  }

  async function startSandbox(profile: GameTrackProfile): Promise<void> {
    engine.clock.stop();
    resetWorld();
    hud.showHud(false);
    if (!(await applyTrack(profile))) return;
    const w: RunWorld = new RunWorld(app.screen, sandboxEvents, {
      scripted: false,
      control: () => playerControl(w),
      maxBuildLevel: profile.maxBuildLevel,
      xpThresholdMul: profile.xpMul,
      weaponDamageMul: weaponDamageMuls(profile),
    });
    world = w;
    w.powerMul = profile.powerMul;
    w.invincible = true;
    view = new RunView(w, app.screen);
    app.stage.addChild(view.stage);
    sandboxPanel = mountSandboxPanel(root, engine, w, {
      track: profile,
      tracks: GAME_TRACKS,
      onTrackChange: (next) => {
        void startSandbox(next);
      },
      onLoadout: renderTrackDeck,
      onExit: () => {
        resetWorld();
        engine.clock.stop();
        hud.showHud(false);
        hud.showStart(GAME_TRACKS, startRun, startSandbox);
        state = 'start';
      },
    });
    state = 'sandbox';
    hud.showHud(true);
    renderTrackDeck();
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
        // The sound mirrors the sim's weapon-only build; gameplay is driven
        // by the virtual clock and the Web Audio engine only plays along.
        engine.setVoiceTier(option.role, option.tier);
        engine.setVoiceEnabled(option.role, true);
        renderTrackDeck();
      },
      onHeal() {
        hud.showToast('the track is complete');
      },
    });
    view = new RunView(w, app.screen);
    app.stage.addChild(view.stage);
    state = 'replay';
    hud.showHud(true);
    renderTrackDeck();
    hud.showToast(`replaying seed ${seed} (${moverName}/${policySpec})`);
    speedRow.style.display = '';
    seekRow.style.display = '';
    seekSlider.value = '0';
    seekSlider.max = String(RUN.durationS);
    seekLabel.textContent = '0:00';
    setReplaySpeed(1);
    startProbe(seed, moverName, policySpec);
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
        hud.showStart(GAME_TRACKS, startRun, startSandbox);
        state = 'start';
      },
    );
  }

  // one trigger, two outputs: the engine already made the sound; this makes
  // the damage.
  engine.addTriggerListener((t) => {
    hud.pulseTrack(t.role);
    if ((state === 'run' || state === 'sandbox') && world) world.fireTrigger(t);
  });

  app.ticker.add((ticker) => {
    engine.update();
    if (paused) return;
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
  };
  hud.mountDebug(Object.values(debugActions));

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') {
      togglePause();
      return;
    }
    const digit = /^(?:Digit|Numpad)([1-8])$/.exec(e.code);
    if (digit) {
      const target = e.target;
      const fromControl =
        target instanceof HTMLElement &&
        (target.isContentEditable || Boolean(target.closest('button, input, select, textarea, summary, a')));
      if (e.repeat || fromControl) return;
      if (toggleTrack(Number(digit[1]) - 1)) e.preventDefault();
      return;
    }
    const byKey: Record<string, { onClick(): void }> = {
      KeyM: debugActions.mute,
      KeyI: debugActions.invincible,
      KeyB: debugActions.autokite,
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

  function fmtTime(s: number): string {
    return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  }

  function pickLabel(option: PickOption): string {
    const kit = engine.voices.get(option.role)?.kit ?? kits.get(option.role)!;
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
    hud.showStart(GAME_TRACKS, startRun, startSandbox);
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
