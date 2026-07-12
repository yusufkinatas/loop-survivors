// All game UI is plain DOM overlaid on the canvas, cheap enough to throw
// away at M4 (docs/phases/m1-demo.md). Start screen, HUD, end screens, and
// the hit flash. Level-up picks are now dropped in-world (see game.ts /
// view.ts), not a DOM screen.

import { type Kit, type Role } from '../audio/kits';
import { SLOTS, SLOT_LABEL, ownerOfSlot, supportedRoster } from './band';

import { TIER_COUNT } from '../audio/charts';

/** Tier numerals still used by the band rack + the bot-replay pick toast. */
export const TIER_NUMERALS = ['I', 'II', 'III', 'IV'];

export interface DebugAction {
  label: string;
  hotkey: string;
  onClick(): void;
  /** For toggles: read the current state so the button can show it. */
  isOn?(): boolean;
  /** For actions whose text changes with state (e.g. the auto-move mode):
   *  overrides `label` and is re-read on every refresh. */
  dynamicLabel?(): string;
}

export class Hud {
  private root: HTMLElement;
  private bar: HTMLElement;
  private hpFill: HTMLElement;
  private xpFill: HTMLElement;
  private timer: HTMLElement;
  private levelEl: HTMLElement;
  private flash: HTMLElement;
  private pulse: HTMLElement;
  private toastStack: HTMLElement;
  private rack: HTMLElement;
  private screen: HTMLElement | null = null;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;
  private kits: Map<Role, Kit>;
  private debugRow: HTMLElement | null = null;
  private debugButtons: { btn: HTMLElement; action: DebugAction }[] = [];

  constructor(root: HTMLElement, kits: Map<Role, Kit>) {
    this.root = root;
    this.kits = kits;

    // Glass transport panel: timer + level chip on top, then the HP and XP
    // meters (each with a fill and a faint cap label).
    this.bar = el('div', 'hud', root);
    const top = el('div', 'hud-top', this.bar);
    this.timer = el('span', 'hud-timer', top, '0:00');
    this.levelEl = el('span', 'hud-level', top, 'LV 1');
    const hp = el('div', 'meter hp', this.bar);
    this.hpFill = el('div', 'fill', hp);
    el('span', 'meter-cap', hp, 'HP');
    const xp = el('div', 'meter xp', this.bar);
    this.xpFill = el('div', 'fill', xp);
    this.bar.style.display = 'none';

    this.flash = el('div', 'hit-flash', root);
    this.pulse = el('div', 'level-pulse', root);
    this.toastStack = el('div', 'toast-stack', root);
    // The band rack: eight sockets, one per band position, empty until hired.
    this.rack = el('div', 'band-rack', root);
    this.rack.style.display = 'none';
  }

  showHud(show: boolean): void {
    this.bar.style.display = show ? '' : 'none';
    this.rack.style.display = show ? '' : 'none';
  }

  /** The band rack (docs/phases/the-band.md): eight typed sockets in rack
   *  order, empty ones asking to be filled, filled ones showing the hired
   *  instrument (its color + name) and its tier as pips. Rebuilt on every pick
   *  (cheap: 8 sockets). Renders into the HUD rack by default, or any supplied
   *  container so the pause menu can show the same band. An audio-muted owner
   *  (the dev number-key toggles) renders its socket dimmed. */
  renderBand(
    tiers: ReadonlyMap<Role, number>,
    into: HTMLElement = this.rack,
    muted?: ReadonlySet<Role>,
  ): void {
    into.replaceChildren();
    for (const slot of SLOTS) {
      const owner = ownerOfSlot(slot, tiers);
      // A slot the soundset supports no instrument for is dropped: shown dimmed
      // and unavailable, never asking to be filled.
      const dropped = supportedRoster(slot).length === 0;
      let cls = dropped ? 'unavailable' : owner ? 'filled' : 'empty';
      if (owner && !dropped && muted?.has(owner)) cls += ' muted';
      const socket = el('div', `band-socket ${cls}`, into);
      el('span', 'socket-slot', socket, SLOT_LABEL[slot]);
      if (owner && !dropped) {
        const kit = this.kits.get(owner)!;
        socket.style.setProperty('--voice-color', kit.color);
        el('span', 'socket-name', socket, kit.name);
        const tier = tiers.get(owner) ?? 1;
        const pips = el('span', 'socket-pips', socket);
        for (let i = 1; i <= TIER_COUNT; i++) {
          el('span', `pip ${i <= tier ? 'on' : ''}`, pips);
        }
      }
    }
  }

  setStatus(hp01: number, xp01: number, level: number, timeS: number): void {
    this.hpFill.style.width = `${Math.max(0, hp01) * 100}%`;
    this.xpFill.style.width = `${xp01 * 100}%`;
    this.levelEl.textContent = `LV ${level}`;
    const m = Math.floor(timeS / 60);
    const s = Math.floor(timeS % 60);
    this.timer.textContent = `${m}:${String(s).padStart(2, '0')}`;
  }

  hitFlash(): void {
    this.flash.classList.remove('on');
    void this.flash.offsetWidth;
    this.flash.classList.add('on');
  }

  /** Level-up affirmation: a full-screen signal-colored edge vignette, the
   *  positive twin of hitFlash. Fired on every applied pick. */
  levelPulse(): void {
    this.pulse.classList.remove('on');
    void this.pulse.offsetWidth;
    this.pulse.classList.add('on');
  }

  /** On-screen debug buttons mirroring the hotkeys (gate B feedback: no
   *  memorizing shortcuts). Hidden by default behind a small ⚙ toggle (UI
   *  cleanup — deviates from the old "always visible" gate note, surfaced to
   *  the developer); the open/closed state persists across sessions. All
   *  hotkeys keep working regardless. */
  mountDebug(actions: DebugAction[]): void {
    const KEY = 'loop.devrow';
    const wrap = el('div', 'debug-wrap', this.root);
    this.debugRow = el('div', 'debug-row', wrap);
    const gear = el('button', 'small debug-btn debug-gear', wrap, '⚙');
    gear.title = 'dev tools';
    let open = localStorage.getItem(KEY) === '1';
    const paint = (): void => {
      this.debugRow!.style.display = open ? '' : 'none';
      gear.classList.toggle('on', open);
    };
    gear.onclick = () => {
      open = !open;
      localStorage.setItem(KEY, open ? '1' : '0');
      paint();
      (gear as HTMLButtonElement).blur();
    };
    paint();
    for (const action of actions) {
      const text = action.dynamicLabel ? action.dynamicLabel() : action.label;
      const btn = el('button', 'small debug-btn', this.debugRow, `${text} (${action.hotkey})`);
      btn.onclick = () => {
        action.onClick();
        this.refreshDebug();
        (btn as HTMLButtonElement).blur(); // keep space/keys for the game
      };
      this.debugButtons.push({ btn, action });
    }
    this.refreshDebug();
  }

  /** Append an arbitrary control (e.g. the timeScale slider, issue #21) into
   *  the debug row so it lives beside the buttons and shares the ⚙ show/hide. */
  appendDebug(node: HTMLElement): void {
    this.debugRow?.appendChild(node);
  }

  /** Re-read toggle states (hotkeys change them without a click). */
  refreshDebug(): void {
    for (const { btn, action } of this.debugButtons) {
      if (action.isOn) btn.classList.toggle('on', action.isOn());
      if (action.dynamicLabel) btn.textContent = `${action.dynamicLabel()} (${action.hotkey})`;
    }
  }

  /** Start screen: every run opens on the kick at tier 1 (non-negotiable for
   *  now). Runs start manual; auto-move is an in-game toggle (B hotkey). */
  showStart(
    onStart: (role: Role) => void,
    onSandbox: () => void,
  ): void {
    const s = this.newScreen();
    el('h1', '', s, 'Loop Survivors');
    el('p', 'sub', s, 'WASD or touch to move. Survive 8 minutes.');
    const startBtn = el('button', 'start-btn', s, 'start');
    startBtn.onclick = () => {
      this.closeScreen();
      onStart('kick');
    };
    // Dev lab entrances, tucked behind one small disclosure so the player-
    // facing start screen stays a single call to action.
    const dev = el('div', 'start-dev', s);
    const devToggle = el('button', 'small start-dev-toggle', dev, 'dev tools');
    const row = el('div', 'start-dev-row', dev);
    row.style.display = 'none';
    devToggle.onclick = () => {
      row.style.display = row.style.display === 'none' ? '' : 'none';
      devToggle.classList.toggle('on', row.style.display !== 'none');
      (devToggle as HTMLButtonElement).blur();
    };
    const bossBtn = el('button', 'small', row, 'boss fights');
    bossBtn.onclick = () => {
      location.hash = '#boss';
    };
    const sandboxBtn = el('button', 'small', row, 'sandbox');
    sandboxBtn.onclick = () => {
      this.closeScreen();
      onSandbox();
    };
    const roomBtn = el('button', 'small', row, 'rehearsal room');
    roomBtn.onclick = () => {
      location.hash = '#rehearsal';
    };
    const labBtn = el('button', 'small', row, 'experimentation room');
    labBtn.onclick = () => {
      location.hash = '#tracklab';
    };
  }

  /** Transient notice (heal fallback, bot replay picks). Toasts stack
   *  instead of overlapping, animate in and out, and cap at four. */
  showToast(text: string): void {
    while (this.toastStack.children.length >= 4) this.toastStack.firstElementChild!.remove();
    const t = el('div', 'toast', this.toastStack, text);
    void t.offsetWidth; // commit the hidden state so the transition runs
    t.classList.add('show');
    setTimeout(() => {
      t.classList.replace('show', 'hide');
      t.addEventListener('transitionend', () => t.remove(), { once: true });
      setTimeout(() => t.remove(), 400); // fallback if transitionend never fires
    }, 2100);
  }

  /** End screen. Weapon chips lead with damage share, kills in parentheses:
   *  kill counts flatter AoE last hits and hide single-target work on tanks
   *  (docs/tools/autoplay-bot.md, damage share is the primary attribution). */
  showEnd(
    victory: boolean,
    stats: {
      timeS: number;
      kills: number;
      level: number;
      damageByRole: Partial<Record<Role, number>>;
      killsByRole: Partial<Record<Role, number>>;
    },
    onRetry: () => void,
  ): void {
    const s = this.newScreen();
    el('h1', '', s, victory ? 'You survived.' : 'You died.');
    const m = Math.floor(stats.timeS / 60);
    const sec = Math.floor(stats.timeS % 60);
    el('p', 'sub', s, `${m}:${String(sec).padStart(2, '0')} · ${stats.kills} kills · level ${stats.level}`);
    const byDamage = (Object.entries(stats.damageByRole) as [Role, number][]).sort(
      (a, b) => b[1] - a[1],
    );
    const total = byDamage.reduce((sum, [, dmg]) => sum + dmg, 0);
    if (byDamage.length > 0 && total > 0) {
      const row = el('div', 'kill-row', s);
      for (const [role, dmg] of byDamage) {
        const kit = this.kits.get(role)!;
        const pct = Math.round((dmg / total) * 100);
        const kills = stats.killsByRole[role] ?? 0;
        const chip = el('span', 'kill-chip', row, `${kit.name} ${pct}% (${kills})`);
        chip.style.setProperty('--voice-color', kit.color);
      }
    }
    const btn = el('button', 'big', s, 'run it back');
    btn.onclick = () => {
      this.closeScreen();
      onRetry();
    };
  }

  private newScreen(): HTMLElement {
    this.closeScreen();
    this.screen = el('div', 'screen', this.root);
    return this.screen;
  }

  private closeScreen(): void {
    if (this.keyHandler) {
      window.removeEventListener('keydown', this.keyHandler);
      this.keyHandler = null;
    }
    this.screen?.remove();
    this.screen = null;
  }
}

function el(tag: string, className: string, parent: HTMLElement, text = ''): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  parent.appendChild(node);
  return node;
}
