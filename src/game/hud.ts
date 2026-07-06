// All game UI is plain DOM overlaid on the canvas, cheap enough to throw
// away at M4 (docs/phases/m1-demo.md). Start screen, HUD, pick screen,
// end screens, and the hit flash.

import { ROLES, type Kit, type Role } from '../audio/kits';
import type { Genre } from '../audio/genres';
import { TIER_LINES } from './config';
import type { PickOption } from './picks';

/** Cards are terse by spec: name, tier numeral, one honest gameplay line,
 *  zero music description (docs/phases/m2-the-arc.md). */
export type { PickOption };

export const TIER_NUMERALS = ['I', 'II', 'III', 'IV'];

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
  private toastStack: HTMLElement;
  private screen: HTMLElement | null = null;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;
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
    this.toastStack = el('div', 'toast-stack', root);
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

  /** Start screen, two steps: choose a genre (your character), then a starting
   *  instrument (it begins at tier 1 — the lone-instrument opening). The genre
   *  decides tempo, swing, and how the whole soundset plays. */
  showStart(
    genres: Genre[],
    onStart: (genre: Genre, role: Role) => void,
    onSandbox: () => void,
  ): void {
    const showGenres = (): void => {
      const s = this.newScreen();
      el('h1', '', s, 'Loop Survivors');
      el('p', 'sub', s, 'Pick your genre. WASD or touch to move. Survive 8 minutes.');
      const grid = el('div', 'pick-grid genre-grid', s);
      const cards: HTMLElement[] = [];
      for (const genre of genres) {
        const card = el('button', 'kit-card genre-card', grid);
        card.style.setProperty('--voice-color', genre.color);
        el('span', 'kit-name', card, genre.name);
        el('span', 'kit-desc', card, genre.blurb);
        el('span', 'genre-bpm', card, `${genre.bpm} BPM`);
        card.onclick = () => showWeapons(genre);
        cards.push(card);
      }
      this.armKeys(cards);
      const row = el('div', 'pick-grid', s);
      const bossBtn = el('button', '', row, 'boss fights');
      bossBtn.onclick = () => {
        location.hash = '#boss';
      };
      const sandboxBtn = el('button', '', row, 'open the sandbox');
      sandboxBtn.onclick = () => {
        this.closeScreen();
        onSandbox();
      };
      const roomBtn = el('button', '', row, 'open the rehearsal room');
      roomBtn.onclick = () => {
        location.hash = '#rehearsal';
      };
      const labBtn = el('button', '', row, 'open the experimentation room');
      labBtn.onclick = () => {
        location.hash = '#tracklab';
      };
    };

    const showWeapons = (genre: Genre): void => {
      const s = this.newScreen();
      el('h2', '', s, `${genre.name} — pick your starting instrument`);
      el('p', 'sub', s, 'Same twelve tools every genre; each one plays them differently.');
      const grid = el('div', 'pick-grid', s);
      const cards: HTMLElement[] = [];
      for (const role of ROLES) {
        cards.push(
          this.kitCard(grid, { role, tier: 1 }, () => {
            this.closeScreen();
            onStart(genre, role);
          }),
        );
      }
      this.armKeys(cards);
      const back = el('button', '', s, '← back to genres');
      back.onclick = () => showGenres();
    };

    showGenres();
  }

  /** Level-up pick: up to three options from the pool of new weapons and
   *  tier-ups of owned ones. */
  showPick(options: PickOption[], onPick: (option: PickOption) => void): void {
    const s = this.newScreen();
    el('h2', '', s, 'Level up');
    const grid = el('div', 'pick-grid', s);
    const cards: HTMLElement[] = [];
    for (const option of options) {
      cards.push(
        this.kitCard(grid, option, () => {
          this.closeScreen();
          onPick(option);
        }),
      );
    }
    this.armKeys(cards);
  }

  /** Arrow keys walk the cards, enter picks the highlighted one (gate B
   *  feedback: picking by mouse alone breaks the flow mid-run). */
  private armKeys(cards: HTMLElement[]): void {
    let idx = 0;
    const select = (i: number): void => {
      cards[idx].classList.remove('selected');
      idx = (i + cards.length) % cards.length;
      cards[idx].classList.add('selected');
    };
    select(0);
    this.keyHandler = (e) => {
      if (e.code === 'ArrowDown' || e.code === 'ArrowRight') select(idx + 1);
      else if (e.code === 'ArrowUp' || e.code === 'ArrowLeft') select(idx - 1);
      else if (e.code === 'Enter' || e.code === 'NumpadEnter') cards[idx].click();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', this.keyHandler);
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

  private kitCard(parent: HTMLElement, option: PickOption, onClick: () => void): HTMLElement {
    const kit = this.kits.get(option.role)!;
    const card = el('button', 'kit-card', parent);
    card.style.setProperty('--voice-color', kit.color);
    const name = option.tier > 1 ? `${kit.name} ${TIER_NUMERALS[option.tier - 1]}` : kit.name;
    el('span', 'kit-name', card, name);
    el('span', 'kit-desc', card, TIER_LINES[option.role][option.tier - 1]);
    card.onclick = onClick;
    return card;
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
