// All game UI is plain DOM overlaid on the canvas, cheap enough to throw
// away at M4 (docs/phases/m1-demo.md). Start screen, HUD, pick screen,
// end screens, and the hit flash.

import { ROLES, type Kit, type Role } from '../audio/kits';

const ARCHETYPES: Record<Role, string> = {
  kick: 'aura pulse around you, on the downbeat',
  snare: 'directional shot on the backbeat',
  hat: 'dense stream of weak fast hits',
  bass: 'slow piercing low wave',
  chord: 'lingering damage zone',
  lead: 'homing shots that play the melody',
};

export interface DebugAction {
  label: string;
  hotkey: string;
  onClick(): void;
  /** For toggles: read the current state so the button can show it. */
  isOn?(): boolean;
}

export class Hud {
  private root: HTMLElement;
  private bar: HTMLElement;
  private hpFill: HTMLElement;
  private xpFill: HTMLElement;
  private timer: HTMLElement;
  private levelEl: HTMLElement;
  private flash: HTMLElement;
  private screen: HTMLElement | null = null;
  private kits: Map<Role, Kit>;
  private debugRow: HTMLElement | null = null;
  private debugButtons: { btn: HTMLElement; action: DebugAction }[] = [];

  constructor(root: HTMLElement, kits: Map<Role, Kit>) {
    this.root = root;
    this.kits = kits;

    this.bar = el('div', 'hud', root);
    const hp = el('div', 'meter hp', this.bar);
    this.hpFill = el('div', 'fill', hp);
    const xp = el('div', 'meter xp', this.bar);
    this.xpFill = el('div', 'fill', xp);
    const row = el('div', 'hud-row', this.bar);
    this.levelEl = el('span', '', row, 'lv 1');
    this.timer = el('span', '', row, '0:00');
    this.bar.style.display = 'none';

    this.flash = el('div', 'hit-flash', root);
  }

  showHud(show: boolean): void {
    this.bar.style.display = show ? '' : 'none';
  }

  setStatus(hp01: number, xp01: number, level: number, timeS: number): void {
    this.hpFill.style.width = `${Math.max(0, hp01) * 100}%`;
    this.xpFill.style.width = `${xp01 * 100}%`;
    this.levelEl.textContent = `lv ${level}`;
    const m = Math.floor(timeS / 60);
    const s = Math.floor(timeS % 60);
    this.timer.textContent = `${m}:${String(s).padStart(2, '0')}`;
  }

  hitFlash(): void {
    this.flash.classList.remove('on');
    void this.flash.offsetWidth;
    this.flash.classList.add('on');
  }

  /** On-screen debug buttons mirroring the hotkeys (gate B feedback: no
   *  memorizing shortcuts). Always visible; toggles show their state. */
  mountDebug(actions: DebugAction[]): void {
    this.debugRow = el('div', 'debug-row', this.root);
    for (const action of actions) {
      const btn = el('button', 'small debug-btn', this.debugRow, `${action.label} (${action.hotkey})`);
      btn.onclick = () => {
        action.onClick();
        this.refreshDebug();
        (btn as HTMLButtonElement).blur(); // keep space/keys for the game
      };
      this.debugButtons.push({ btn, action });
    }
    this.refreshDebug();
  }

  /** Re-read toggle states (hotkeys change them without a click). */
  refreshDebug(): void {
    for (const { btn, action } of this.debugButtons) {
      if (action.isOn) btn.classList.toggle('on', action.isOn());
    }
  }

  /** Start screen: choose the starting kit. */
  showStart(onPick: (role: Role) => void): void {
    const s = this.newScreen();
    el('h1', '', s, 'Loop Survivors');
    el('p', 'sub', s, 'M1 demo — pick your starting instrument. WASD to move. Nothing else.');
    const grid = el('div', 'pick-grid', s);
    for (const role of ROLES) {
      this.kitCard(grid, role, () => {
        this.closeScreen();
        onPick(role);
      });
    }
    const roomBtn = el('button', '', s, 'open the rehearsal room');
    roomBtn.onclick = () => {
      location.hash = '#rehearsal';
    };
  }

  /** Level-up pick: choose one of up to three new kits. */
  showPick(options: Role[], onPick: (role: Role) => void): void {
    const s = this.newScreen();
    el('h2', '', s, 'Level up — add a voice');
    const grid = el('div', 'pick-grid', s);
    for (const role of options) {
      this.kitCard(grid, role, () => {
        this.closeScreen();
        onPick(role);
      });
    }
  }

  /** Heal fallback when every kit is owned. */
  showToast(text: string): void {
    const t = el('div', 'toast', this.root, text);
    setTimeout(() => t.remove(), 1600);
  }

  showEnd(
    victory: boolean,
    stats: { timeS: number; kills: number; level: number; byWeapon: [Role, number][] },
    onRetry: () => void,
  ): void {
    const s = this.newScreen();
    el('h1', '', s, victory ? 'You survived.' : 'You died.');
    const m = Math.floor(stats.timeS / 60);
    const sec = Math.floor(stats.timeS % 60);
    el('p', 'sub', s, `${m}:${String(sec).padStart(2, '0')} · ${stats.kills} kills · level ${stats.level}`);
    if (stats.byWeapon.length > 0) {
      const row = el('div', 'kill-row', s);
      for (const [role, kills] of stats.byWeapon) {
        const kit = this.kits.get(role)!;
        const chip = el('span', 'kill-chip', row, `${kit.name} ${kills}`);
        chip.style.setProperty('--voice-color', kit.color);
      }
    }
    const btn = el('button', 'big', s, 'run it back');
    btn.onclick = () => {
      this.closeScreen();
      onRetry();
    };
  }

  private kitCard(parent: HTMLElement, role: Role, onClick: () => void): void {
    const kit = this.kits.get(role)!;
    const card = el('button', 'kit-card', parent);
    card.style.setProperty('--voice-color', kit.color);
    el('span', 'kit-name', card, kit.name);
    el('span', 'kit-desc', card, ARCHETYPES[role]);
    card.onclick = onClick;
  }

  private newScreen(): HTMLElement {
    this.closeScreen();
    this.screen = el('div', 'screen', this.root);
    return this.screen;
  }

  private closeScreen(): void {
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
