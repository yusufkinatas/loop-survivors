// The game shell: Pixi app, run states, and the wiring between the music
// engine and the world. The engine stays a pure function of build and grid;
// the game only listens to its triggers and toggles voices on picks.

import { Application } from 'pixi.js';
import type { MusicEngine } from '../audio/engine';
import { SOUNDSET } from '../audio/soundset';
import { ROLE_COLORS, ROLES, type Kit, type Role } from '../audio/kits';
import { CHEST, chestTickTimes, ENCORE, GEM_CUE, HEALTH_PICKUP, LEVELUP, NOTE_CUE, VICTORY } from './config';
import { mountTrackOverlay } from './trackoverlay';
import { Hud } from './hud';
import { pushDamageFeedback } from './damage-feedback';
import { createGreedyMover, createKiter, type AutoMover } from './auto-move';
import { autoMove, Input, type AutoMoveMode } from './input';
import { mountJoystick } from './joystick';
import { rollOffers, rollStartingWeapons, type AnyPickOption } from './picks';
import { RunWorld, type Chest, type VacuumResult } from './run';
import { SIM_DT } from './timing';
import { preloadRunArt, RunView, type ChestReelEntry, type GroundPickCopy } from './view';
import { mountSandboxPanel, type SandboxPanel } from './sandbox';
import { EVOLUTION_BY_ROLE, type EvolutionDefinition } from './build';
import { chartStageForLevel, WEAPON_MAX_LEVEL } from './weapons/levels';
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
  // ESC resumes. Both playable arenas pause; menu screens do not.
  const pauseOverlay = document.createElement('div');
  pauseOverlay.className = 'screen pause-overlay';
  pauseOverlay.style.display = 'none';
  pauseOverlay.innerHTML =
    '<h1>Paused</h1><div class="pause-rack"></div><div class="pause-arrange"></div><div class="pause-items pause-stats"></div><button class="pause-resume">RESUME SET</button><p class="hint">Escape also resumes.</p>';
  root.appendChild(pauseOverlay);
  const pauseRack = pauseOverlay.querySelector('.pause-rack') as HTMLElement;
  /** THE ARRANGE SURFACE (#265). Empty in the base — the passives panel that
   *  used to sit here is gone with the passives, and nothing replaces it yet.
   *
   *  It is kept as a named, always-mounted slot because three of the five
   *  round-1 stacks need somewhere to arrange or record OFF the clock (#255
   *  named "somewhere to arrange or record" as a dependency two candidates
   *  share), and the pause screen is the one surface in the game that already
   *  stops the world without ending the run. A prototype fills this node and
   *  paints it from `paintPausePanels`; the base leaves it empty, and an empty
   *  div renders as nothing. */
  const pauseArrange = pauseOverlay.querySelector('.pause-arrange') as HTMLElement;
  const pauseStats = pauseOverlay.querySelector('.pause-stats') as HTMLElement;
  /** Everything the pause screen shows about the build, in one place so ESC and
   * a mid-pause level-up paint the same panels. */
  function paintPausePanels(w: RunWorld): void {
    hud.renderBand(w.tiers, {
      into: pauseRack,
      deactivated: deactivatedRoles,
      pending: pendingRoles,
      evolved: w.evolved,
      showTiers: true,
    });
    void pauseArrange;
    hud.renderStats({ maxHp: w.playerMaxHp, armor: w.playerArmor, mods: w.buildMods }, pauseStats);
  }
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
      // Show the current build while paused: the band, the passives, the totals.
      if (world) paintPausePanels(world);
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

  // Every XP threshold and every chest grants one upgrade. Several can
  // arrive in the same simulation tick, including while the first pick screen
  // is already open, so callbacks enqueue instead of being discarded by the
  // state guard. A queued pick is not presented until the previous choice has
  // actually entered on its next bar.
  const pendingUpgrades: number[] = [];
  const pendingEvolutionChoices: EvolutionDefinition[][] = [];
  // The chest slot machine (docs/plan.md, "Chests"): opened chests queue here
  // and play one full ceremony at a time — spin, land, payout — so a
  // five-minute mark's chest burst reads as back-to-back rituals, never
  // stacked slow-mos.
  // `index` is the chest's lifetime ordinal, captured AT OPEN: a burst of
  // chests queues several ceremonies, and each must keep the scripted-payout
  // position it was opened at, not the one its ceremony finally starts at.
  const pendingChests: { x: number; y: number; index: number; forceSize?: 1 | 3 | 5 }[] = [];
  let chestCeremony: {
    x: number;
    y: number;
    size: 1 | 3 | 5;
    evolution: boolean;
    /** Real seconds since the spin started (the reel runs on wall clock). */
    t: number;
    landed: boolean;
    /** The rolled payout, spawned one pedestal per drop tick after landing. */
    drops?: ChestDropPlan[];
    dropped: number;
  } | null = null;
  // A landed chest's payout, physically on the ground: pre-rolled GRANTS (not
  // choices) waiting to be walked onto. Unlike the level-up triangle, a pickup
  // leaves its siblings in place — you scoop them one by one.
  //
  // A drop names a THING, never a level: it is worth +1 to that weapon or
  // passive, resolved against live state at the moment it is scooped. That is
  // the same currency the level-up triangle deals in, so both surfaces carry
  // the very same option type and resolve through the same `applyPickup`.
  interface ChestDropPlan {
    x: number;
    y: number;
    option: AnyPickOption;
  }
  const chestDrops: ChestDropPlan[] = [];
  /** The maxed-build payout, as an option: what a hit with nothing left to
   *  level pays, and what the safety net converts a doomed scoop into. */
  const TIP_JAR: AnyPickOption = { kind: 'encore', encore: 'tipJar' };
  /** A weapon's scooped-but-not-yet-heard levels. Weapon changes enter on the
   *  next bar, so between the scoop and the bar line the level lives here:
   *
   *  - `queued` — scooped, still waiting for a bar line.
   *  - `entering` — taken by a bar line (the chart has already changed for the
   *    bar's first note) but not yet heard, so `w.tiers` still holds the old
   *    tier and old-tier damage is still truthful.
   *
   *  Both count as promised, so a roll during either window can never offer a
   *  level that is already spoken for. There is deliberately NO "a flush is
   *  scheduled" flag: every scoop arms its own bar callback and a callback that
   *  finds the counter already drained simply does nothing. A flag would be a
   *  latch, and `engine.clearBarQueue()` can drop the callback that clears it —
   *  after which the weapon could never enter again. Draining from the counter
   *  instead means a dropped callback self-heals on the next scoop, which even
   *  recovers the levels the drop stranded. */
  interface PendingWeapon {
    queued: number;
    entering: number;
    /** Continuations a triangle scoop is owed once its levels actually land. */
    onEntered: ((barAudioTime: number) => void)[];
  }
  const pendingWeapons = new Map<Role, PendingWeapon>();
  /** Levels a weapon has been promised that `w.tiers` cannot see yet. */
  function weaponInFlight(role: Role): number {
    const pending = pendingWeapons.get(role);
    return pending ? pending.queued + pending.entering : 0;
  }
  /** The level a weapon will stand at once everything already scooped lands.
   *  What a scoop of it resolves against, and what its pedestal describes. */
  function weaponLevelNow(w: RunWorld, role: Role): number {
    return (w.tiers.get(role) ?? 0) + weaponInFlight(role);
  }
  // The pickup chirp climbs while the player keeps scooping rewards (a chest
  // scatter reads as one rising run), and resets after a short gap.
  let pickupStep = 0;
  let lastPickupAudioT = -Infinity;
  function nextPickupStep(): number {
    const now = engine.ctx.currentTime;
    pickupStep = now - lastPickupAudioT < 1.6 ? Math.min(pickupStep + 1, 9) : 0;
    lastPickupAudioT = now;
    return pickupStep;
  }
  let pickAwaitingBar = false;
  let presentQueuedPickAtAudioT: number | null = null;
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

  /** Every +1 the run owes but has not yet paid into `w.tiers`: scooped pickups
   *  riding to their bar line, plus every un-scooped pedestal still on the
   *  ground. Both surfaces count — only the chest CEREMONY blocks a triangle,
   *  not its drops, so a triangle and a chest payout can be lying around at the
   *  same time.
   *
   *  This is what replaced reserving concrete levels. A roll drops a thing from
   *  its pool once `live + promised` reaches the ceiling, so no pickup is ever
   *  rolled that is doomed to be wasted — and because these are counts, not
   *  target levels, two pedestals for the same weapon are simply worth +1 each.
   *
   *  Deliberately NOT consulted by pedestal copy: a pedestal is inside this
   *  count itself, and describing what it will deliver must not include
   *  promises nobody has taken yet. */
  function outstandingPromises(): Map<Role, number> {
    const weapons = new Map<Role, number>();
    for (const [role, pending] of pendingWeapons) weapons.set(role, pending.queued + pending.entering);
    const count = (option: ShellPick): void => {
      if (option.kind === 'weapon') weapons.set(option.role, (weapons.get(option.role) ?? 0) + 1);
    };
    for (const pick of groundPicks) count(pick.option);
    for (const drop of chestDrops) count(drop.option);
    return weapons;
  }

  /** Everything a pedestal says about itself, answered from LIVE state at the
   *  moment it is asked — which is why `refreshPedestals` can re-ask it after
   *  every scoop. A pedestal must never describe a level its scoop won't
   *  deliver, and a sibling scoop changes exactly that.
   *
   *  Numbers are gone from the badge on purpose: two drops of the same weapon
   *  used to read "2 → 3" and "3 → 4" side by side, which leaked the old
   *  reservation system and read as nonsense when you scooped the second one
   *  first. A pedestal now says what it IS; the toast says what you got. */
  function pedestalFor(w: RunWorld, option: ShellPick): GroundPickCopy {
    if (option.kind === 'evolution') {
      return { role: option.evolution.role, color: option.evolution.color,
        name: option.evolution.name, badge: 'EVOLVE' };
    }
    if (option.kind === 'encore') return encorePickView(w, option.encore);
    const level = weaponLevelNow(w, option.role);
    // Nothing left to level: the scoop pays a Tip Jar, so the pedestal is one.
    if (level >= WEAPON_MAX_LEVEL) return encorePickView(w, 'tipJar');
    return { role: option.role, color: ROLE_COLORS[option.role],
      name: kits.get(option.role)!.name, badge: level === 0 ? 'NEW' : 'LEVEL UP' };
  }

  /** Re-read every pedestal on the ground. Called after every scoop and after
   *  any weapon entry, because both change what the pedestals still lying there
   *  will hand over — a second copy of the same passive is a different level
   *  now, and its effect line has to say so. */
  function refreshPedestals(): void {
    const w = world;
    if (!w) return;
    view?.setGroundPicks(groundPicks.map((pick) => ({ x: pick.x, y: pick.y, ...pedestalFor(w, pick.option) })));
    view?.setChestDrops(chestDrops.map((drop) => ({ x: drop.x, y: drop.y, ...pedestalFor(w, drop.option) })));
  }

  function clearGroundPicks(): void {
    if (groundPicks.length > 0) groundPicks = [];
    view?.setGroundPicks([]);
  }

  function resetUpgradeQueue(): void {
    pendingUpgrades.length = 0;
    pendingEvolutionChoices.length = 0;
    pendingChests.length = 0;
    chestCeremony = null;
    chestDrops.length = 0;
    pendingWeapons.clear();
    view?.clearChestCeremony();
    view?.setChestDrops([]);
    pickAwaitingBar = false;
    presentQueuedPickAtAudioT = null;
    clearGroundPicks();
    endLevelMoment();
  }

  function enqueueUpgrade(level: number): void {
    if (!world || state !== 'run' || world.won) return;
    pendingUpgrades.push(level);
  }

  // A level-up no longer opens a menu: the three offers drop as items on the
  // ground and the run keeps playing. Only one triangle is out at a time; a
  // queued reward waits until the current one is collected and its weapon has
  // entered on the next bar (pickAwaitingBar / presentQueuedPickAtAudioT).
  function presentNextUpgrade(): void {
    if (!world || state !== 'run' || pickAwaitingBar || presentQueuedPickAtAudioT !== null) return;
    if (world.won) return; // the set is over; the demo end offers nothing more
    if (chestCeremony !== null) return; // the slot reel owns the moment
    if (groundPicks.length > 0) return; // one triangle at a time

    const w = world;
    if (pendingEvolutionChoices.length > 0) {
      const eligibleNow = new Set(w.eligibleEvolutions().map(({ role }) => role));
      const evolutionOptions = pendingEvolutionChoices.shift()!
        .filter(({ role }) => eligibleNow.has(role))
        .slice(0, 3)
        .map((evolution): EvolutionPick => ({ kind: 'evolution', evolution }));
      // 'none': the chest ceremony that queued these already played the fanfare.
      if (evolutionOptions.length > 0) dropGroundPicks(w, evolutionOptions, 'none');
      else presentNextUpgrade();
      return;
    }
    // One reward drops its offer and stops; the rest wait their turn here.
    while (pendingUpgrades.length > 0 && groundPicks.length === 0) {
      pendingUpgrades.shift();
      // The real offer for this reward: three build cards, or — once the build
      // is complete — the Encore's fixed pair. The pool sees what the run has
      // already promised (a chest payout can be lying on the ground right now),
      // so it never offers a level that is already spoken for.
      const options = rollOffers({
        tiers: w.tiers,
        pendingTiers: outstandingPromises(),
        rng: Math.random,
        timeS: w.timeS,
      });
      dropGroundPicks(w, options);
    }
  }

  /** How loudly a ground-pick drop is celebrated.
   *  - `'level'`: the full LEVELUP.momentS slow-mo — a real level-up.
   *  - `'none'`: no slow-mo, no mix duck, no level cue and no HUD pulse — only
   *    the burst that reads as "here are your options". Used for the opening
   *    hire, and for evolution triangles queued by a chest whose slot ceremony
   *    already played the fanfare. */
  type Celebration = 'level' | 'none';

  /** Where card `i` of `count` sits on the ring around the player. Three cards
   *  are the authored triangle; any other count — the Encore's fixed pair, a
   *  one- or two-recipe evolution offer — divides the circle evenly so the
   *  drop still reads as balanced and the safe ring still centres on the
   *  player. */
  function pickAngleDeg(i: number, count: number): number {
    return count === LEVELUP.angles.length ? LEVELUP.angles[i] : (360 / count) * i;
  }

  /** The Encore pedestals, and the Tip Jar a maxed build's leftover chest hit
   *  pays: one place, so the level-up card and the chest pedestal are the same
   *  object to the player. First Aid quotes what it will actually restore, the
   *  way the floor drop's toast does. */
  function encorePickView(
    w: RunWorld,
    encore: 'firstAid' | 'tipJar',
  ): { glyph: string; color: number; name: string; badge: string } {
    if (encore === 'firstAid') {
      return { glyph: '✚', color: 0xff665a, name: 'First Aid',
        badge: `+${Math.round(w.playerMaxHp * HEALTH_PICKUP.healFraction)} HP` };
    }
    return { glyph: '♫', color: 0xffd45c, name: 'Tip Jar', badge: `+${ENCORE.tipJarNotes} ♫` };
  }

  /** Drop the offered options as items in a ring around the player, shove the
   *  horde clear of them, and fire the cosmetic level-up moment. */
  function dropGroundPicks(w: RunWorld, options: ShellPick[], celebrate: Celebration = 'level'): void {
    const cx = w.player.x;
    const cy = w.player.y;
    const items: GroundItem[] = [];
    for (let i = 0; i < options.length; i++) {
      const option = options[i];
      const deg = pickAngleDeg(i, options.length);
      const rad = (deg * Math.PI) / 180;
      // Portrait screens have less visible world width than the authored
      // triangle. Clamp the horizontal offset far enough inside the camera for
      // the 168-unit name/effect plate to stay fully readable, while retaining
      // more than the fixed 40-unit walk-to-collect distance.
      const horizontalRoom = Math.max(LEVELUP.itemPickupRadius + 4, w.worldW / 2 - 92);
      const x = cx + Math.max(-horizontalRoom, Math.min(horizontalRoom, Math.cos(rad) * LEVELUP.itemRadius));
      const y = cy + Math.sin(rad) * LEVELUP.itemRadius;
      items.push({ x, y, option });
    }
    groundPicks = items;
    refreshPedestals();
    w.shoveEnemiesOut(cx, cy, LEVELUP.enemyPushRadius);
    if (celebrate === 'none') view?.levelBurst(cx, cy);
    else startLevelMoment(cx, cy, LEVELUP.momentS);
  }

  /** The satisfying beat: slowScale slow-mo plus a short mix dip, held for
   *  `momentS` real seconds unless the player collects a pick first. */
  function startLevelMoment(cx: number, cy: number, momentS: number): void {
    momentT = momentS;
    momentScale = LEVELUP.slowScale;
    applyClockRate();
    engine.duckWeapons(LEVELUP.duckDepth, momentS);
    engine.playLevelCue();
    hud.levelPulse();
    view?.levelBurst(cx, cy);
  }

  /** Resolve ONE scooped pickup against live state — the single place a pickup
   *  turns into build. Both surfaces come through here, because on both a
   *  pickup means exactly the same thing: +1 level to the thing it names.
   *
   *  The safety net: a pickup that somehow lands on something already maxed
   *  pays a Tip Jar rather than vanishing. Promise counting is supposed to make
   *  that unreachable in a run; the sandbox's loadout editor can still move the
   *  ground out from under a pedestal.
   *
   *  Returns where the level went: `'bar'` — a weapon, riding to the next bar
   *  line — or `'now'` — an Encore, landed on the spot. */
  function applyPickup(
    w: RunWorld,
    option: AnyPickOption,
    onEntered?: (barAudioTime: number) => void,
  ): 'bar' | 'now' {
    if (option.kind === 'encore') {
      // Both Encore options resolve here and now — nothing waits for a bar,
      // because neither one changes what the band is playing.
      const landed = w.applyEncoreChoice(option.encore);
      hud.showToast(option.encore === 'firstAid'
        ? `FIRST AID · +${Math.round(landed)} HP`
        : `TIP JAR · +${landed} ♫`);
      return 'now';
    }
    const level = weaponLevelNow(w, option.role);
    if (level >= WEAPON_MAX_LEVEL) return applyPickup(w, TIP_JAR, onEntered);
    // One level short of the top is the only warning the player gets that an
    // evolution is coming: with passives gone the recipe is the ladder itself
    // (#265), so there is no second ingredient to teach on a pedestal.
    const evoCopy = level + 1 >= WEAPON_MAX_LEVEL && EVOLUTION_BY_ROLE[option.role] && !w.evolved.has(option.role)
      ? ` · EVO READY · ${EVOLUTION_BY_ROLE[option.role]!.name}`
      : '';
    // The toast is the one place in a run the player learns their real level,
    // and at scoop time the outcome is already settled — live plus everything
    // in flight — so the number is truthful even though the sound waits.
    hud.showToast(`${kits.get(option.role)!.name} → tier ${level + 1}${evoCopy}`);
    promoteWeapon(w, option.role, onEntered);
    return 'bar';
  }

  /** Bank +1 for a weapon and make sure a bar line is coming to spend it.
   *
   *  Every scoop arms its own bar callback; the first callback of a bar takes
   *  the whole banked total and the rest find it empty and do nothing. So five
   *  pickups scooped inside one bar are five levels at that bar line, chart
   *  stage and world tier moving together — not one level with four thrown
   *  away, which is what taking `max(live, promised)` used to do.
   *
   *  Two phases, as everywhere else a weapon changes: the chart changes at the
   *  bar's start so the bar's first note is the new one, and `w.tiers` waits
   *  for the heard timestamp so any older trigger still in the air does
   *  old-tier damage. */
  function promoteWeapon(
    w: RunWorld,
    role: Role,
    onEntered?: (barAudioTime: number) => void,
  ): void {
    const pending = pendingWeapons.get(role) ?? { queued: 0, entering: 0, onEntered: [] };
    pending.queued += 1;
    if (onEntered) pending.onEntered.push(onEntered);
    pendingWeapons.set(role, pending);
    engine.atNextBar((barAudioTime) => {
      if (world !== w || (state !== 'run' && state !== 'sandbox')) return;
      // Re-read: the entry may have been cleared and rebuilt under us.
      const p = pendingWeapons.get(role);
      if (!p || p.queued === 0) return; // a sibling scoop's callback took this bar
      p.entering += p.queued;
      p.queued = 0;
      // Scoops landing between here and the heard timestamp below belong to the
      // NEXT bar — they armed their own callback and are still in `queued`.
      const owed = p.onEntered.splice(0);
      const target = Math.min(WEAPON_MAX_LEVEL, (w.tiers.get(role) ?? 0) + p.entering);
      engine.setVoiceTier(role, chartStageForLevel(target));
      // Sticky deactivation: a tier-up applies the new tier but does not revive
      // an instrument the developer deliberately turned off. It returns at the
      // higher tier when reactivated.
      if (!deactivatedRoles.has(role)) engine.setVoiceEnabled(role, true);
      engine.atAudioTime(barAudioTime, () => {
        if (world !== w || (state !== 'run' && state !== 'sandbox')) return;
        p.entering = 0;
        if (p.queued === 0 && p.onEntered.length === 0) pendingWeapons.delete(role);
        w.addWeapon(role, target);
        paintBand();
        view?.flourish(w.player.x, w.player.y);
        refreshPedestals(); // this weapon's other pedestals are worth a level more now
        for (const entered of owed) entered(barAudioTime);
      });
    });
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
    // Every walk-onto collection chirps and kicks — the level-up cue announced
    // the offer; the chirp plus a small enemy shove confirm the take.
    engine.playPickupCue(nextPickupStep());
    w.shoveEnemiesOut(item.x, item.y, LEVELUP.pickupPushRadius);
    const option = item.option;
    clearGroundPicks();
    if (option.kind !== 'evolution') {
      const outcome = applyPickup(w, option, (barAudioTime) => {
        pickAwaitingBar = false;
        // Wait until this bar's due gameplay triggers have been consumed by one
        // fixed world step before dropping a stacked reward's triangle.
        presentQueuedPickAtAudioT = barAudioTime;
      });
      hud.levelPulse();
      // One flourish per pickup, where it lands: a passive or an Encore lands
      // here, a weapon lands at its bar line and flourishes there instead.
      if (outcome === 'now') view?.flourish(w.player.x, w.player.y);
      refreshPedestals(); // a chest payout may still be lying around
      if (outcome === 'bar') pickAwaitingBar = true;
      else presentNextUpgrade();
      return;
    }
    pickAwaitingBar = true;
    engine.atNextBar((barAudioTime) => {
      if (world !== w || state !== 'run') return;
      // Audio is scheduled ahead, so its chart must change now for the first
      // note of the new bar. World state waits for the exact heard timestamp
      // below, preserving old-tier damage on any older trigger.
      const stillEligible = w.eligibleEvolutions().some(({ role }) => role === option.evolution.role);
      if (!stillEligible) {
        pickAwaitingBar = false;
        presentNextUpgrade();
        return;
      }
      engine.setEvolutionGain(option.evolution.role, option.evolution.gainDb);
      engine.atAudioTime(barAudioTime, () => {
        if (world !== w || state !== 'run') return;
        w.evolve(option.evolution.role);
        hud.renderBand(w.tiers, { deactivated: deactivatedRoles, pending: pendingRoles, evolved: w.evolved });
        refreshTrackOverlay();
        view?.flourish(w.player.x, w.player.y);
        pickAwaitingBar = false;
        presentQueuedPickAtAudioT = barAudioTime;
      });
    });
  }


  // ---------------------------------------------------------------------------
  // The chest slot machine. Walking onto a chest no longer resolves instantly:
  // the case rattles under a reel of possible rewards while ticks climb the
  // scale (each one a note higher, the intervals stretching like a slowing
  // wheel), then the reel stops on the payout. A ready evolution is always the
  // top prize; otherwise the chest pays 1/3/5 free level-ups of things already
  // owned — an early chest is never just a consolation heal.

  /** Payout size for this chest: the save's first few follow the scripted
   *  opening sequence (a guaranteed early jackpot taste), then random weights. */
  function rollChestSize(index: number): 1 | 3 | 5 {
    const scripted = CHEST.openingSequence[index];
    if (scripted !== undefined) return scripted;
    const roll = Math.random();
    if (roll < CHEST.jackpotChance) return 5;
    if (roll < CHEST.jackpotChance + CHEST.bigWinChance) return 3;
    return 1;
  }

  /** Eligible evolutions NOT already promised by a queued or dropped triangle.
   *  Without this, two chests opened back to back with one recipe ready would
   *  both land "EVOLUTION READY" — and the second would pay nothing. */
  function unpromisedEvolutions(w: RunWorld): EvolutionDefinition[] {
    const promised = new Set<Role>();
    for (const choices of pendingEvolutionChoices) for (const choice of choices) promised.add(choice.role);
    for (const pick of groundPicks) {
      if (pick.option.kind === 'evolution') promised.add(pick.option.evolution.role);
    }
    return w.eligibleEvolutions().filter(({ role }) => !promised.has(role));
  }

  /** Everything the reel can visibly land on, shuffled: owned weapons by name
   *  and color, the health garnish, and — when a weapon is maxed — the
   *  evolutions, so the spin teases the real prize. */
  function chestReelEntries(w: RunWorld, evolutions: EvolutionDefinition[]): ChestReelEntry[] {
    const entries: ChestReelEntry[] = [];
    for (const evolution of evolutions) entries.push({ label: evolution.name, color: evolution.color });
    for (const role of w.tiers.keys()) entries.push({ label: kits.get(role)!.name, color: ROLE_COLORS[role] });
    entries.push({ label: '+HP', color: 0xff665a });
    for (let i = entries.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [entries[i], entries[j]] = [entries[j], entries[i]];
    }
    return entries;
  }

  /** Start the next queued ceremony, if none is running: deep slow-mo, mix
   *  duck, the spin cue, and the view's rattling reel — all on one schedule. */
  function tryStartChestCeremony(): void {
    const w = world;
    if (!w || chestCeremony || (state !== 'run' && state !== 'sandbox')) return;
    const chest = pendingChests.shift();
    if (!chest) return;
    const evolutions = unpromisedEvolutions(w);
    const evolution = evolutions.length > 0;
    chestCeremony = { x: chest.x, y: chest.y, size: evolution ? 5 : chest.forceSize ?? rollChestSize(chest.index), evolution, t: 0, landed: false, dropped: 0 };
    // Rides the level-moment slow-mo machinery: deeper and longer than a
    // level-up (this is the game's biggest reward beat), released just after
    // the landing burst.
    momentT = CHEST.spinS + CHEST.landS;
    momentScale = CHEST.slowScale;
    applyClockRate();
    engine.duckWeapons(CHEST.duckDepth, CHEST.spinS + CHEST.landS);
    const ticks = chestTickTimes();
    engine.playChestSpinCue(ticks);
    w.shoveEnemiesOut(chest.x, chest.y, LEVELUP.enemyPushRadius);
    view?.startChestCeremony(chest.x, chest.y, ticks, chestReelEntries(w, evolutions));
  }

  /** The reel stopped: resolve and celebrate the payout. */
  function landChest(): void {
    const w = world;
    const ceremony = chestCeremony;
    if (!w || !ceremony || (state !== 'run' && state !== 'sandbox')) return;
    if (ceremony.evolution) {
      const choices = unpromisedEvolutions(w);
      if (choices.length > 0) {
        engine.playChestLandCue(3);
        view?.landChestCeremony('EVOLUTION READY', 0xffdf74, { big: true, jackpot: true });
        if (state === 'sandbox') {
          // No ground-pick flow in the sandbox: evolve the first ready role.
          const evolution = choices[0];
          w.evolve(evolution.role);
          engine.setEvolutionGain(evolution.role, evolution.gainDb);
          paintBand();
          hud.showToast(`EVOLVED · ${evolution.name}`);
        } else {
          pendingEvolutionChoices.push(choices);
        }
        return;
      }
      ceremony.size = 1; // eligibility evaporated mid-spin; pay a level-up
    }
    engine.playChestLandCue(ceremony.size === 5 ? 3 : ceremony.size === 3 ? 2 : 1);
    const healed = w.healPlayer(CHEST.healBySize[ceremony.size]);
    ceremony.drops = rollChestDrops(w, ceremony.size);
    const banner = ceremony.size === 5 ? 'JACKPOT ×5' : ceremony.size === 3 ? 'BIG WIN ×3'
      : (ceremony.drops[0] ? pedestalFor(w, ceremony.drops[0].option).name : 'CHEST').toUpperCase();
    view?.landChestCeremony(banner, ceremony.size === 1 ? 0xffd45c : 0xffdf74,
      { big: ceremony.size >= 3, jackpot: ceremony.size === 5 });
    hud.showToast(healed > 0 ? `CHEST ×${ceremony.size} · +${Math.round(healed)} HP` : `CHEST ×${ceremony.size}`);
    hud.levelPulse();
    // The payout scatters around the player, so clear the landing area — the
    // per-drop shoves keep it clear while the pedestals thud in.
    w.shoveEnemiesOut(w.player.x, w.player.y, LEVELUP.enemyPushRadius);
  }

  /** Roll a chest's payout: `count` level-ups of things the player already
   *  owns, as drop plans — NOTHING is applied here, and no concrete level is
   *  decided. Each plan becomes a pedestal that thuds in after the reel stops
   *  and is worth +1 to its thing whenever it is scooped.
   *
   *  The pool is rebuilt per drop against `live + promised`, and this payout's
   *  own hits are added to that count as they are rolled — so a ×5 spends its
   *  hits across what can still level, and no chest, triangle or earlier drop
   *  can be promised a level twice. A hit that finds the pool empty — the last
   *  hits of a ×5 on a nearly maxed build, every hit on a fully maxed one —
   *  pays a Tip Jar instead.
   *
   *  This "nothing left to level" test is deliberately NOT the level-up
   *  screen's maxed-build test: this pool is owned-only, so a chest still pays
   *  a build that has open cap slots the level-up screen would offer to fill.
   *  Both tests just agree on what a leftover is worth. */
  function rollChestDrops(w: RunWorld, count: 1 | 3 | 5): ChestDropPlan[] {
    const cx = w.player.x;
    const cy = w.player.y;
    // Same portrait-screen clamp as the level-up triangle: pedestals must stay
    // fully readable inside the camera.
    const horizontalRoom = Math.max(LEVELUP.itemPickupRadius + 4, w.worldW / 2 - 92);
    const startDeg = Math.random() * 360;
    const promised = outstandingPromises();
    const drops: ChestDropPlan[] = [];
    for (let i = 0; i < count; i++) {
      const deg = startDeg + (360 / count) * i + (Math.random() - 0.5) * 24;
      const rad = (deg * Math.PI) / 180;
      const radius = CHEST.dropRadius + (Math.random() - 0.5) * 30;
      const x = cx + Math.max(-horizontalRoom, Math.min(horizontalRoom, Math.cos(rad) * radius));
      const y = cy + Math.sin(rad) * radius;
      const pool: AnyPickOption[] = [];
      for (const role of w.tiers.keys()) {
        const level = (w.tiers.get(role) ?? 0) + (promised.get(role) ?? 0);
        if (level < WEAPON_MAX_LEVEL) pool.push({ kind: 'weapon', role });
      }
      if (pool.length === 0) {
        drops.push({ x, y, option: TIP_JAR });
        continue;
      }
      const target = pool[Math.floor(Math.random() * pool.length)];
      // This hit is now a promise of its own, and the next hit must see it.
      if (target.kind === 'weapon') promised.set(target.role, (promised.get(target.role) ?? 0) + 1);
      drops.push({ x, y, option: target });
    }
    return drops;
  }

  /** One reward thuds onto the boards: pedestal in, enemies shoved back, a
   *  pitched bam. The staggered ticker calls this once per drop. */
  function spawnChestDrop(w: RunWorld, drop: ChestDropPlan, index: number): void {
    chestDrops.push(drop);
    refreshPedestals();
    engine.playChestDropCue(index);
    w.shoveEnemiesOut(drop.x, drop.y, 150);
    w.fx?.push({ type: 'ring', x: drop.x, y: drop.y, radius: 120, color: pedestalFor(w, drop.option).color, dur: 0.45, soft: true });
    view?.pushShake(3, 0.22);
  }

  /** Walk-onto collection of one chest drop: apply just that reward — its
   *  siblings stay on the ground — and chirp the pickup cue. */
  function collectChestDrop(drop: ChestDropPlan): void {
    const w = world;
    if (!w) return;
    chestDrops.splice(chestDrops.indexOf(drop), 1);
    engine.playPickupCue(nextPickupStep());
    w.shoveEnemiesOut(drop.x, drop.y, LEVELUP.pickupPushRadius);
    hud.levelPulse();
    // Same rule as the triangle: the flourish marks the landing, so a weapon's
    // waits for its bar line rather than doubling up on the pedestal.
    if (applyPickup(w, drop.option) === 'now') view?.flourish(drop.x, drop.y);
    // The siblings left standing may be worth a different level now.
    refreshPedestals();
  }

  const events = {
    onLevelUp(level: number): void {
      enqueueUpgrade(level);
    },
    onDeath(): void {
      endRun(false);
    },
    onVictory(): void {
      beginVictoryOutro();
    },
    onHit(): void {
      pushDamageFeedback(hud.flashEl, view, engine);
    },
    onChest(chest: Chest): void {
      if (!world || state !== 'run') return;
      // The scripted 1-1-3-1-1-5 opening is now indexed PER RUN, not per save
      // (#265: the save's career layer is gone). That is deliberately the
      // fresh-save experience, repeated: every prototype run gets the same
      // early jackpot, which is also what makes two branches' captures
      // comparable instead of depending on how much the tester had played.
      pendingChests.push({ x: chest.x, y: chest.y, index: world.chestsOpened - 1 });
      tryStartChestCeremony();
    },
    onGemCollected(_xp: number, levelProgress: number): void {
      engine.playGemCue({ ...GEM_CUE, levelProgress });
    },
    onNoteCollected(): void {
      engine.playNoteCue({ ...NOTE_CUE });
    },
    onStageMagnet(result: VacuumResult): void {
      engine.playStageMagnetCue();
      const total = result.gems + result.notes;
      hud.showToast(total > 0
        ? `STAGE MAGNET · ${total} PICKUPS INBOUND`
        : 'STAGE MAGNET · FLOOR CLEAR');
    },
    onHealthPickup(healed: number): void {
      engine.playHealthPickupCue();
      hud.showToast(`FIRST AID · +${Math.round(healed)} HP`);
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
      pushDamageFeedback(hud.flashEl, view, engine);
    },
    onChest(chest: Chest): void {
      if (!world || state !== 'sandbox') return;
      // Sandbox chests skip the scripted opening (index past the sequence), so
      // the panel's DROP CHEST button exercises the random weights — unless
      // the chest carries a pinned size from a ×1/×3/×5 button.
      pendingChests.push({ x: chest.x, y: chest.y, index: CHEST.openingSequence.length + world.chestsOpened, forceSize: chest.forceSize });
      tryStartChestCeremony();
    },
    onGemCollected(_xp: number, levelProgress: number): void {
      engine.playGemCue({ ...GEM_CUE, levelProgress });
    },
    onNoteCollected(): void {
      engine.playNoteCue({ ...NOTE_CUE });
    },
    onStageMagnet(result: VacuumResult): void {
      engine.playStageMagnetCue();
      const total = result.gems + result.notes;
      hud.showToast(total > 0
        ? `STAGE MAGNET · ${total} PICKUPS INBOUND`
        : 'STAGE MAGNET · FLOOR CLEAR');
    },
    onHealthPickup(healed: number): void {
      engine.playHealthPickupCue();
      hud.showToast(`FIRST AID · +${Math.round(healed)} HP`);
    },
  };
  let sandboxPanel: SandboxPanel | null = null;
  let liveAcc = 0;
  /** Audio-clock instant the win screen is due, or null outside the demo end.
   *  Audio time, not wall time, so a pause (which suspends the context) holds
   *  the empty-stage beat instead of running it out behind the pause overlay. */
  let victoryScreenAtAudioT: number | null = null;
  const LIVE_MAX_STEPS = 6;

  function applyGain(): void {
    engine.setMasterGain(muted ? 0 : 0.8);
  }

  function resetWorld(): void {
    paused = false;
    resetUpgradeQueue();
    liveAcc = 0;
    victoryScreenAtAudioT = null;
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
    });
    world = w;
    w.player.hp = w.playerMaxHp;
    w.powerMul = SOUNDSET.powerMul;
    view = new RunView(w, app.screen);
    app.stage.addChild(view.stage);
    hud.showHud(true);
    pauseButton.style.display = '';
    hud.renderBand(w.tiers, { evolved: w.evolved });
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
        rng: Math.random,
        timeS: 0,
      }),
      'none',
    );
  }

  function startSandbox(): void {
    resetWorld();
    const w: RunWorld = new RunWorld(app.screen, sandboxEvents, {
      scripted: false,
      rng: mulberry32(0x5eed),
      control: () => playerControl(w),
    });
    world = w;
    w.powerMul = SOUNDSET.powerMul;
    w.invincible = true;
    view = new RunView(w, app.screen);
    app.stage.addChild(view.stage);
    sandboxPanel = mountSandboxPanel(root, engine, w, {
      onLoadout: () => {
        hud.renderBand(w.tiers, { deactivated: deactivatedRoles, pending: pendingRoles, evolved: w.evolved });
        refreshTrackOverlay();
        // The editor can move the ground out from under a pedestal still lying
        // there; pedestal copy is answered from live state, so re-ask it.
        refreshPedestals();
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
    pauseButton.style.display = '';
    hud.renderBand(w.tiers, { evolved: w.evolved });
    state = 'sandbox';
    syncTimeScaleControl(); // arm the timeScale slider for the sandbox
    void engine.ctx.resume();
    engine.clock.start();
  }

  /** The demo end (mad-forest-spec §8), from the world's 30:00 onward. The
   *  world has already frozen its clock, made the player untouchable and armed
   *  the clear wave; the shell owns everything the world cannot see:
   *
   *  1. Every pending reward is dropped on the floor of the ticket — a queued
   *     level-up, an un-scooped triangle, a mid-spin chest. The set is over;
   *     nothing new is offered and nothing half-shown survives into the screen.
   *  2. The track plays out its current bar and stops ON the bar line, and the
   *     win flourish rings out from exactly that instant into the silence.
   *  3. `quietBeatS` of empty stage, timed off the same bar line, and then the
   *     win screen — the one caller that has ever passed victory = true.
   *
   *  The run stays in state 'run' throughout: the world keeps stepping, so the
   *  sweep animates and the player can still walk their empty stage. */
  function beginVictoryOutro(): void {
    if (!world || state !== 'run' || victoryScreenAtAudioT !== null) return;
    const w = world;
    resetUpgradeQueue();
    engine.stopAtBarEnd((barAudioTime) => {
      if (world !== w || state !== 'run') return;
      engine.playWinCue(barAudioTime);
      victoryScreenAtAudioT = barAudioTime + VICTORY.quietBeatS;
    });
  }

  function endRun(victory = false): void {
    if (!world || state === 'end') return;
    state = 'end';
    victoryScreenAtAudioT = null;
    syncTimeScaleControl(); // no live world to scale on the end screen
    resetUpgradeQueue();
    liveAcc = 0;
    applyGain();
    // Cue first, then cut the track: the collapse rides master, so it rings
    // out over the silence the stopped clock leaves behind. A win has already
    // had both — the track stopped on its bar line and the flourish rang out
    // across the empty-stage beat — so it arrives here with nothing to play.
    if (!victory) engine.playGameOverCue();
    engine.clock.stop();
    engine.clearBarQueue();
    hud.showHud(false);
    pauseButton.style.display = 'none';
    // Nothing is settled any more: the run ends where it ends (#265). The end
    // screen reports the run and offers another one.
    hud.showEnd(
      victory,
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
    trackOverlay.refresh(world?.tiers ?? new Map(), deactivatedRoles, pendingRoles);
  }
  function toggleChartOverlay(): void {
    const show = trackOverlayEl.style.display === 'none';
    trackOverlayEl.style.display = show ? '' : 'none';
    if (show) refreshTrackOverlay();
  }

  // Number-key instrument toggles (dev mechanism): Digit1..Digit5 map to the
  // five weapon slots in acquisition order and activate/deactivate the weapon in
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
    hud.renderBand(world.tiers, { deactivated: deactivatedRoles, pending: pendingRoles, evolved: world.evolved });
    // The pause menu mirrors the same build; keep it truthful if it's open.
    if (paused) paintPausePanels(world);
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
        // Tell the WORLD too, not just the engine. Disabling a voice stops its
        // triggers, which is the whole of how a deactivated weapon stops dealing
        // damage — except for the texture auras, which have no triggers to stop
        // (see RunWorld.silenced). Without this line a switched-off `pad` or
        // `air` keeps damaging out of silence.
        w?.silenced.add(role);
      } else {
        deactivatedRoles.delete(role);
        engine.setVoiceEnabled(role, true);
        w?.silenced.delete(role);
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
      // Chest ceremony clock, on REAL seconds: the spin cue is scheduled in
      // wall-clock AudioContext time, so the landing must be too. Land the
      // payout mid-ceremony, then clear and start the next queued chest.
      if (chestCeremony && world === w && state === steppingState) {
        chestCeremony.t += frameS;
        if (!chestCeremony.landed && chestCeremony.t >= CHEST.spinS) {
          chestCeremony.landed = true;
          landChest();
        }
        // The staggered payout: one pedestal per drop tick — bam, bam, bam.
        if (chestCeremony?.drops) {
          const ceremony = chestCeremony;
          const drops = ceremony.drops!;
          while (
            ceremony.dropped < drops.length &&
            ceremony.t >= CHEST.spinS + CHEST.dropDelayS + ceremony.dropped * CHEST.dropGapS
          ) {
            spawnChestDrop(w, drops[ceremony.dropped], ceremony.dropped);
            ceremony.dropped++;
          }
        }
        if (
          chestCeremony?.landed &&
          chestCeremony.t >= CHEST.spinS + CHEST.landS &&
          chestCeremony.dropped >= (chestCeremony.drops?.length ?? 0)
        ) {
          chestCeremony = null;
          tryStartChestCeremony();
        }
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
      // Level and chest rewards are raised from inside RunWorld.update(). Drop
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
      // Chest drops scoop the same way — one per frame, but siblings stay put.
      // Live in the sandbox too (DROP CHEST exercises the whole ceremony).
      if (chestDrops.length > 0 && world === w && (state === 'run' || state === 'sandbox')) {
        const p = w.player;
        const rr = LEVELUP.itemPickupRadius * LEVELUP.itemPickupRadius;
        for (const drop of chestDrops) {
          const dx = p.x - drop.x;
          const dy = p.y - drop.y;
          if (dx * dx + dy * dy <= rr) {
            collectChestDrop(drop);
            break;
          }
        }
      }
      // The empty-stage beat is up: the demo end's win screen. Timed off the
      // audio clock the win flourish started on, so the two never drift.
      if (
        victoryScreenAtAudioT !== null &&
        world === w &&
        state === 'run' &&
        engine.ctx.currentTime >= victoryScreenAtAudioT
      ) {
        endRun(true);
      }
      // A level-up/death can change state inside a fixed step. Paused gameplay
      // never resumes with fractional time banked from before the screen opened.
      if (state !== steppingState || world !== w) liveAcc = 0;
      view?.update(visualDt, Math.min(frameS, 1 / 20));
      hud.setStatus(
        w.player.hp / w.playerMaxHp,
        w.xpProgress(),
        w.level,
        w.timeS,
      );
      hud.setRunInfo(w.evolved, w.notesCollected);
      sandboxPanel?.update();
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
    // Digit0 resets timeScale straight back to 1x (issue #21): a quick escape
    // from whatever the [ / ] nudges or slider left it at. Live in run + sandbox.
    if (e.code === 'Digit0' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (timeScaleLive()) {
        setTimeScale(1);
        hud.showToast(`speed ${timeScale.toFixed(2)}x`);
      }
      return;
    }
    // Number-key instrument toggles are live only in a run or sandbox.
    if (/^Digit[1-5]$/.test(e.code) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if ((state === 'run' || state === 'sandbox') && world) {
        const role = [...world.tiers.keys()][Number(e.code.slice(5)) - 1];
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
