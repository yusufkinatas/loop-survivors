// The game shell: Pixi app, run states, and the wiring between the music
// engine and the world. The engine stays a pure function of build and grid;
// the game only listens to its triggers and toggles voices on picks.

import { Application } from 'pixi.js';
import type { MusicEngine } from '../audio/engine';
import { activeGenre } from '../audio/chartstore';
import {
  GENRES,
  GENRE_BY_ID,
  DEFAULT_GENRE,
  type Genre,
  type GenreId,
} from '../audio/genres';
import { ROLES, type Kit, type Role } from '../audio/kits';
import { SIM_DT, VirtualConductor } from '../bot/conductor';
import { MOVERS, type MoverName } from '../bot/movers';
import { makePolicy } from '../bot/policies';
import { SIM_VIEW } from '../bot/sim';
import { mountPlayground, type Playground } from '../rehearsal/playground';
import { SLOTS, ownerOfSlot } from './band';
import { HOLD, RUN } from './config';
import { EFFECT_META } from './effects';
import { Hud, TIER_NUMERALS } from './hud';
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
    // A drop's build is already scheduled to absolute audio times; pausing only
    // stops the sequencer, not those pre-scheduled riser/roll/gap/slam events,
    // so they'd play over a frozen pause screen. The build is a ~2-4s window —
    // just defer the pause until it lands (the drop then resolves normally).
    if (!paused && world?.dropInFlight) return;
    paused = !paused;
    pauseOverlay.style.display = paused ? '' : 'none';
    if (paused) {
      engine.clock.pause();
      // A drop mid-build would land its sim slam + juice late (out of sync with
      // the audio, which keeps running on the context clock). Cancel it and
      // unfreeze the armed voices' charge.
      pendingSlam = null;
      if (world) world.dropInFlight = false;
      engine.setChargeHums([]);
      // Show the current band while paused (the same rack the HUD draws).
      if (world) hud.renderBand(world.tiers, pauseRack);
    } else engine.clock.resume();
  }

  // ---- Hold & Drop v2.1 (per-voice charge, docs/phases/hold-and-drop-v2.md) ----
  // Two verbs. ARM (number keys 1-8): pull a band position back — it leaves the
  // mix on the next beat (a musical breakdown, not a mid-bar cut) and banks its
  // OWN charge (the socket is the gauge; charge fills at a base rate danger
  // multiplies). DROP (Q): commit every armed voice into one build -> gap ->
  // slam, REBUILT from the player's own instruments; the build fires now and the
  // sim slam + juice land on the exact grid downbeat. A sub-minimum drop fizzles
  // for free. Player-driven only, so the bot/replay path never touches this.
  let pendingSlam: { at: number; power: number; land: () => void } | null = null;

  function bringInOnBeat(role: Role): void {
    const w = world;
    if (!w) return;
    engine.atNextBeat(() => {
      if (world === w) engine.setVoiceEnabled(role, true);
    });
  }
  // ARM / DISARM a slot. Arm: the voice leaves on the next beat (quantized, so
  // it exits musically) while its socket begins charging now. Disarm: returns
  // the voice on the next beat, no build/slam/payoff, banked charge forfeit.
  // Blocked while a drop is in flight (the armed set is committed).
  function toggleArm(slotIdx: number): void {
    if (paused || !world || pendingSlam || !(state === 'run' || state === 'sandbox')) return;
    const w = world;
    const owner = ownerOfSlot(SLOTS[slotIdx], w.tiers);
    if (!owner) return;
    if (w.held.has(owner)) {
      w.disarmRole(owner);
      bringInOnBeat(owner); // voice returns on the next beat
    } else if (w.holdRole(owner)) {
      // Leave the mix on the next beat (musical), not an instant mid-bar cut.
      engine.atNextBeat(() => {
        if (world === w && w.held.has(owner)) engine.setVoiceEnabled(owner, false);
      });
    }
  }
  // Resolve the drop's voices by SLOT so the build is made from what the player
  // owns: roll their Hats+Backbeat, re-fire their Pulse+Bass in key, borrow a
  // generic voice only to fill an empty slot (docs/phases/hold-and-drop-v2.md).
  function dropVoices(tiers: ReadonlyMap<Role, number>): {
    rollRoles: Role[];
    gapRoles: Role[];
    oneRoles: Role[];
    borrowKick: boolean;
    borrowSub: boolean;
  } {
    const pulse = ownerOfSlot('pulse', tiers);
    const backbeat = ownerOfSlot('backbeat', tiers);
    const hats = ownerOfSlot('hats', tiers);
    const bass = ownerOfSlot('bass', tiers);
    const rollRoles = [hats, backbeat].filter((r): r is Role => !!r);
    const oneRoles = [pulse, bass].filter((r): r is Role => !!r);
    return {
      rollRoles,
      gapRoles: [...tiers.keys()], // the whole loop
      oneRoles,
      borrowKick: !pulse,
      borrowSub: !bass,
    };
  }
  // DROP: commit the armed voices. The drop's SIZE is frozen here at commit
  // (summed charge × any sync bonus), so it can't drift as charge keeps moving
  // through the build; the sim slam + render juice share that one number.
  function dropAll(): void {
    if (paused || !world || pendingSlam || !(state === 'run' || state === 'sandbox')) return;
    if (!engine.clock.running || world.dropOnCooldown()) return;
    const w = world;
    const roles = [...w.held];
    if (roles.length === 0) return;
    const sum = w.chargeSum();
    if (sum < HOLD.charge.fizzleBelow) {
      // Unearned: no build, voices pop back on the next beat, weak slam, no
      // amplified window, no charge cost, no cooldown — its own punishment.
      w.landDrop(roles, HOLD.build.fizzleSlamMul, false);
      view?.dropJuice(HOLD.build.fizzleSlamMul);
      for (const role of roles) bringInOnBeat(role);
      return;
    }
    // Synchronized full-band "all-in": every owned voice armed within the window.
    const synced =
      HOLD.sync.enabled && w.isFullBandSynced(HOLD.sync.windowBeats * engine.beatSeconds);
    const syncMul = synced ? 1 + HOLD.sync.bonus : 1;
    // Combo (spec, kept): spreading the same charge across more voices beats the
    // sum of its parts. syncBonus is an extra edge on top for the all-in.
    const combo = 1 + (roles.length - 1) * HOLD.comboBonus;
    const power = sum * combo * syncMul;
    // Freeze each voice's amplified-fire multiplier from its charge at commit.
    const muls = new Map<Role, number>();
    for (const role of roles) {
      muls.set(role, 1 + w.chargeOf(role) * (HOLD.maxFireMul - 1) * combo * syncMul);
    }
    const dv = dropVoices(w.tiers);
    // Non-sync drops keep the gate-A-approved 2-bar build; a synchronized all-in
    // gets a deeper gap (a full cut, over the per-genre duck) so the brace reads
    // bigger. (Per-genre 1-vs-2-bar / grid-flex is Sub-phase C, not here.)
    const gapFloor = synced ? 0 : Math.max(0, 1 - (HOLD.gapDuck[activeGenre().id] ?? 1));
    const sched = engine.scheduleDrop({
      bars: HOLD.build.slowGenreBars,
      gapBeats: HOLD.build.gapBeats,
      rollRoles: dv.rollRoles,
      gapRoles: dv.gapRoles,
      gapFloor,
      oneRoles: dv.oneRoles,
      borrowKick: dv.borrowKick,
      borrowSub: dv.borrowSub,
      voiceCount: roles.length,
    });
    w.dropInFlight = true; // freeze charge through the build
    pendingSlam = {
      at: sched.slamTime,
      power,
      land: () => {
        if (world !== w) {
          return;
        }
        w.landDrop(roles, power, true, muls);
        w.dropInFlight = false;
        engine.setChargeHums([]); // the hums resolved into the slam
        // The armed voices crash back in on the one.
        for (const role of roles) engine.setVoiceEnabled(role, true);
      },
    };
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
            // A tier-up on a held instrument keeps it silent (still pulled back).
            engine.setVoiceEnabled(option.role, !w!.held.has(option.role));
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
    pendingSlam = null; // don't let a drop scheduled in a dead run fire on the next one
    engine.setChargeHums([]); // stop any lingering charge hums
    engine.clearBarQueue();
    engine.clearVoiceEffects();
    for (const role of ROLES) engine.setVoiceEnabled(role, false);
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
    hud.setGenre(genre.id);
    engine.setVoiceTier(startingKit, 1);
    engine.setVoiceEnabled(startingKit, true);
    world.addWeapon(startingKit, 1);
    hud.showHud(true);
    hud.renderItems(world.items);
    hud.renderBand(world.tiers);
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
      hud.setGenre(g.id);
      hud.renderBand(w.tiers);
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
    // Death/victory leaves world.held populated; stop any armed voices' charge
    // hums so they don't drone through the end screen (they're free-running
    // oscillators, not sequencer-driven).
    engine.setChargeHums([]);
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
      world.update(dt);
      // Hold & Drop v2: when the audio build reaches its grid-locked downbeat,
      // land the sim slam and the render-clock juice on the SAME frame as the
      // beat crashes back in (the flash/shake/wave come from dropSlam's fx).
      if (pendingSlam && engine.ctx.currentTime >= pendingSlam.at) {
        pendingSlam.land();
        view?.dropJuice(pendingSlam.power);
        pendingSlam = null;
      }
      view?.update(dt);
      hud.setStatus(
        world.player.hp / RUN.playerHp,
        world.xpProgress(),
        world.level,
        world.timeS,
      );
      hud.updateHold(world);
      // Drive the per-armed-voice charge hums (you HEAR the bet banking). While a
      // drop is in flight the hums are cut by its land handler and stay off.
      if (!pendingSlam) {
        engine.setChargeHums(
          [...world.held].map((role) => ({ role, charge: world!.chargeOf(role) })),
        );
      }
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
    // Hold & Drop: number keys 1-8 arm a band position, Q drops all armed.
    if (e.code.startsWith('Digit')) {
      const n = Number(e.code.slice(5));
      if (n >= 1 && n <= 8) {
        toggleArm(n - 1);
        return;
      }
    }
    if (e.code === 'KeyQ') {
      dropAll();
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

