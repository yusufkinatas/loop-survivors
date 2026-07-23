// The Boss Fight page (#boss). Pick a boss, then fight it. The boss makes the
// music and the whole track is the fight: you have no weapons, only movement
// and a dodge dash, and you win by surviving until the song ends (the boss's
// "health" bar is really the song draining away). Each boss is a completely
// different survival problem — see bosses.ts.

import { Application } from 'pixi.js';
import { LabEngine } from '../tracklab/labengine';
import { Input } from '../../game/input';
import { mountJoystick } from '../../game/joystick';
import { BossConductor, type BossTransport } from './conductor';
import { Mp3Engine } from './mp3engine';
import { BOSSES, type BossDef } from './bosses';
import { ARENA, BossWorld } from './world';
import { BossView } from './view';
import { pushDamageFeedback } from '../../game/damage-feedback';

type State = 'select' | 'loading' | 'fight' | 'end';

function el(tag: string, className: string, parent: HTMLElement, text = ''): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  parent.appendChild(node);
  return node;
}

function fmtTime(s: number): string {
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

export async function mountBossFight(root: HTMLElement, ctx: AudioContext): Promise<void> {
  root.innerHTML = '';
  root.classList.add('game-root');
  root.addEventListener('contextmenu', (e) => e.preventDefault());

  const app = new Application();
  await app.init({
    background: 0x0c0c12,
    resizeTo: window,
    antialias: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
  });
  root.appendChild(app.canvas);
  mountJoystick(root);

  const input = new Input();
  let state: State = 'select';
  let def: BossDef | null = null;
  let transport: BossTransport | null = null;
  let conductor: BossConductor | null = null;
  let world: BossWorld | null = null;
  let view: BossView | null = null;
  let muted = false;
  let invincible = false;
  let dashQueued = false;
  let syncOffset = 0;
  // Bumped on every startBoss; a load that finishes after a newer one started
  // (even for the same boss — identity on `def` can't tell two loads apart)
  // bails instead of spawning a second overlapping fight.
  let loadToken = 0;

  // ---- HUD (built once, shown during the fight) ----
  const hud = el('div', 'boss-hud', root);
  hud.style.display = 'none';
  const topbar = el('div', 'boss-topbar', hud);
  const bossName = el('div', 'boss-name', topbar, '');
  const healthTrack = el('div', 'boss-health', topbar);
  const healthFill = el('div', 'fill', healthTrack);
  const phaseLabel = el('div', 'boss-phase', topbar, '');
  const playerBar = el('div', 'boss-playerbar', hud);
  el('span', 'lbl', playerBar, 'YOU');
  const hpTrack = el('div', 'meter hp', playerBar);
  const hpFill = el('div', 'fill', hpTrack);

  const controls = el('div', 'boss-controls', root);
  controls.style.display = 'none';
  const backBtn = el('button', 'small', controls, '‹ bosses') as HTMLButtonElement;
  backBtn.onclick = () => toSelect();
  const dashBtn = el('button', 'small boss-dash', controls, 'DASH') as HTMLButtonElement;
  dashBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (state === 'fight') dashQueued = true;
  });
  const invBtn = el('button', 'small', controls, 'invincible') as HTMLButtonElement;
  invBtn.onclick = () => {
    invincible = !invincible;
    if (world) world.invincible = invincible;
    invBtn.classList.toggle('on', invincible);
    invBtn.blur();
  };
  const muteBtn = el('button', 'small', controls, 'mute') as HTMLButtonElement;
  muteBtn.onclick = () => {
    muted = !muted;
    transport?.setMasterGain(muted ? 0 : 0.85);
    muteBtn.classList.toggle('on', muted);
    muteBtn.blur();
  };

  // Sync strip (mp3 bosses only): slide the record under the attack grid until
  // the downbeats line up by ear. Coarse (¼s) skips intros; fine (20ms) locks
  // the beat. The readout is the number to bake into the boss's `offsetS`.
  const syncRow = el('div', 'boss-sync', controls);
  syncRow.style.display = 'none';
  const nudge = (delta: number): void => {
    if (!(transport instanceof Mp3Engine)) return;
    syncOffset = Math.max(0, syncOffset + delta);
    transport.setSyncOffset(syncOffset);
    syncVal.textContent = `${syncOffset.toFixed(2)}s`;
  };
  const mkNudge = (label: string, delta: number): void => {
    const b = el('button', 'small', syncRow, label) as HTMLButtonElement;
    b.onclick = () => {
      nudge(delta);
      b.blur();
    };
  };
  el('span', 'lbl', syncRow, 'sync');
  mkNudge('«', -0.25);
  mkNudge('‹', -0.02);
  const syncVal = el('span', 'boss-sync-val', syncRow, '0.00s');
  mkNudge('›', 0.02);
  mkNudge('»', 0.25);

  const flash = el('div', 'hit-flash', root);
  let screen: HTMLElement | null = null;
  const newScreen = (): HTMLElement => {
    screen?.remove();
    screen = el('div', 'screen boss-screen', root);
    return screen;
  };
  const closeScreen = (): void => {
    screen?.remove();
    screen = null;
  };

  function teardownFight(): void {
    conductor?.stop();
    transport?.dispose();
    if (view) {
      app.stage.removeChild(view.stage);
      view.destroy();
    }
    conductor = null;
    transport = null;
    world = null;
    view = null;
    dashQueued = false; // don't carry a queued dash into the next fight
  }

  function toSelect(): void {
    teardownFight();
    state = 'select';
    def = null;
    hud.style.display = 'none';
    controls.style.display = 'none';
    app.renderer.background.color = 0x0c0c12;
    showSelect();
  }

  function showSelect(): void {
    const s = newScreen();
    el('h1', '', s, 'Boss Fights');
    el(
      'p',
      'sub',
      s,
      'No weapons here. The boss makes the music, and the whole track is the fight — survive to the last bar and it falls. Move with WASD / arrows or the joystick; dash with Space or Shift.',
    );
    const grid = el('div', 'boss-select', s);
    for (const b of BOSSES) {
      const card = el('button', 'boss-card', grid) as HTMLButtonElement;
      card.style.setProperty('--boss-color', `#${b.palette.boss.toString(16).padStart(6, '0')}`);
      el('span', 'boss-card-arch', card, b.archetype);
      el('span', 'boss-card-name', card, b.name);
      el('span', 'boss-card-artist', card, `${b.track.artist} · ${b.track.bpm} bpm`);
      el('span', 'boss-card-tag', card, b.tagline);
      card.onclick = () => void startBoss(b);
    }
    const row = el('div', 'boss-select-foot', s);
    const gameBtn = el('button', 'small', row, '‹ back to game') as HTMLButtonElement;
    gameBtn.onclick = () => {
      location.hash = '';
    };
  }

  async function startBoss(chosen: BossDef): Promise<void> {
    teardownFight();
    def = chosen;
    const myToken = ++loadToken;
    state = 'loading';
    const s = newScreen();
    el('h2', '', s, `Summoning ${chosen.name}…`);
    el('p', 'sub', s, 'building instruments');

    let engine: BossTransport;
    try {
      engine = chosen.mp3
        ? await Mp3Engine.load(ctx, chosen.track, chosen.mp3.url, chosen.mp3.offsetS ?? 0)
        : await LabEngine.load(ctx, chosen.track);
    } catch (err) {
      if (myToken !== loadToken) return; // a newer load supersedes this one
      const es = newScreen();
      el('h2', '', es, 'Failed to summon');
      el('p', 'sub', es, err instanceof Error ? err.message : String(err));
      if (chosen.mp3) {
        el('p', 'sub', es, `Put the track at public${chosen.mp3.url} and try again.`);
      }
      const b = el('button', 'big', es, 'back') as HTMLButtonElement;
      b.onclick = () => toSelect();
      return;
    }
    // Bail if a newer fight started while instruments built (navigated away, or
    // a rapid re-click — even to the same boss). Identity on `def` can't tell
    // two loads of one boss apart, so gate on the per-invocation token.
    if (myToken !== loadToken) {
      engine.dispose();
      return;
    }
    transport = engine;
    syncOffset = chosen.mp3?.offsetS ?? 0;

    world = new BossWorld(() => input.axis(), {
      onHit: () => pushDamageFeedback(flash, view),
      onDeath: () => endFight(false),
    });
    world.invincible = invincible;
    const bx = chosen.spawn.x * ARENA.w;
    const by = chosen.spawn.y * ARENA.h;
    world.spawnBoss({
      x: bx,
      y: by,
      homeX: bx,
      homeY: by,
      radius: chosen.bossRadius,
      color: chosen.palette.boss,
      behavior: chosen.behavior,
      chaseSpeed: chosen.chaseSpeed,
      contactDamage: chosen.contactDamage,
    });

    view = new BossView(world, chosen.palette);
    app.stage.addChild(view.stage);
    app.renderer.background.color = chosen.palette.bg;

    const w = world;
    const d = chosen;
    conductor = new BossConductor(transport, chosen.arrangement, {
      onStep: (info) => d.onStep(info, w),
      onSectionEnter: (id, i) => {
        d.onSectionEnter?.(id, i, w);
        phaseLabel.textContent = `${i + 1}/${d.arrangement.length} · ${conductor!.sectionName(id)}`;
      },
      onFinish: () => endFight(true),
    });

    // seed the first phase so section-0 behavior is set before the first beat
    d.onSectionEnter?.(chosen.arrangement[0].sectionId, 0, w);

    bossName.textContent = chosen.name;
    phaseLabel.textContent = '';
    healthFill.style.width = '100%';
    hpFill.style.width = '100%';
    hud.style.display = '';
    controls.style.display = '';
    syncRow.style.display = chosen.mp3 ? '' : 'none';
    syncVal.textContent = `${syncOffset.toFixed(2)}s`;
    invBtn.classList.toggle('on', invincible);
    muteBtn.classList.toggle('on', muted);
    closeScreen();
    state = 'fight';
    transport.setMasterGain(muted ? 0 : 0.85);
    conductor.start();
  }

  function endFight(victory: boolean): void {
    if (state !== 'fight' || !world || !def) return;
    state = 'end';
    world.frozen = true;
    conductor?.stop();
    hud.style.display = 'none';
    controls.style.display = 'none';
    const finishedDef = def;
    const s = newScreen();
    el('h1', '', s, victory ? 'You survived.' : 'Down.');
    el(
      'p',
      'sub',
      s,
      victory
        ? `${finishedDef.name} played its last bar. You outlasted the whole track.`
        : `${finishedDef.name} got you at ${fmtTime(world.timeS)} of ${fmtTime(conductor?.durationS ?? 0)}.`,
    );
    const row = el('div', 'boss-select-foot', s);
    const again = el('button', 'big', row, 'fight again') as HTMLButtonElement;
    again.onclick = () => void startBoss(finishedDef);
    const pick = el('button', 'small', row, 'choose boss') as HTMLButtonElement;
    pick.onclick = () => toSelect();
    const gameBtn = el('button', 'small', row, 'back to game') as HTMLButtonElement;
    gameBtn.onclick = () => {
      location.hash = '';
    };
  }

  // dash on Space / Shift (kept out of screens so buttons still work)
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
      if (state === 'fight') {
        dashQueued = true;
        e.preventDefault();
      }
    }
  });

  app.ticker.add((ticker) => {
    if (state === 'fight' && world && view && transport && conductor) {
      transport.update();
      // Drain beat events at audio time (spawns this frame's attacks) before
      // the world steps, so new hazards move on the same frame they appear.
      conductor.update(transport.ctx.currentTime);
      const dt = Math.min(ticker.deltaMS / 1000, 1 / 20);
      const dash = dashQueued;
      dashQueued = false;
      world.update(dt, dash);
      view.update(dt, app.screen.width, app.screen.height);
      hpFill.style.width = `${Math.max(0, (world.player.hp / world.player.maxHp) * 100)}%`;
      if (conductor) healthFill.style.width = `${Math.max(0, (1 - conductor.progress01()) * 100)}%`;
    } else if (state === 'end' && world && view) {
      // keep the last frame alive (frozen sim) so the arena doesn't blank out
      view.update(Math.min(ticker.deltaMS / 1000, 1 / 20), app.screen.width, app.screen.height);
    }
  });

  // console handle for probing
  const gw = window as unknown as { loop?: Record<string, unknown> };
  if (gw.loop) {
    gw.loop.boss = {
      get world() {
        return world;
      },
      get conductor() {
        return conductor;
      },
      bosses: BOSSES,
      fight: (id: string) => {
        const b = BOSSES.find((x) => x.id === id);
        if (b) void startBoss(b);
      },
      /** Set the mp3 sync offset (seconds) precisely from the console. */
      sync: (seconds: number) => {
        if (transport instanceof Mp3Engine) {
          syncOffset = Math.max(0, seconds);
          transport.setSyncOffset(syncOffset);
          syncVal.textContent = `${syncOffset.toFixed(2)}s`;
        }
      },
    };
  }

  showSelect();
}
