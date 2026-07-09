// All game UI is plain DOM overlaid on the canvas, cheap enough to throw
// away at M4 (docs/phases/m1-demo.md). Start screen, HUD, pick screen,
// end screens, and the hit flash.

import { type Kit, type Role } from '../audio/kits';
import { sampledRoles } from '../audio/kits/index';
import { SLOTS, SLOT_LABEL, ownerOfSlot, slotOf, supportedRoster } from './band';
import { TIER_LINES } from './config';
import { EFFECT_META } from './effects';
import { type AutoMoveMode } from './input';
import { ITEMS, type ItemId } from './items';
import type { PickOption } from './picks';

import { TIER_COUNT } from '../audio/charts';

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
  private itemStrip: HTMLElement;
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
    this.itemStrip = el('div', 'item-strip', root);
    this.itemStrip.style.display = 'none';
    // The band rack: eight sockets, one per band position, empty until hired.
    this.rack = el('div', 'band-rack', root);
    this.rack.style.display = 'none';
  }

  showHud(show: boolean): void {
    this.bar.style.display = show ? '' : 'none';
    this.itemStrip.style.display = show ? '' : 'none';
    this.rack.style.display = show ? '' : 'none';
  }

  /** The band rack (docs/phases/the-band.md): eight typed sockets in rack
   *  order, empty ones asking to be filled, filled ones showing the hired
   *  instrument (its color + name) and its tier as pips. Rebuilt on every pick
   *  (cheap: 8 sockets). Renders into the HUD rack by default, or any supplied
   *  container so the pause menu can show the same band. */
  renderBand(tiers: ReadonlyMap<Role, number>, into: HTMLElement = this.rack): void {
    into.replaceChildren();
    for (const slot of SLOTS) {
      const owner = ownerOfSlot(slot, tiers);
      // A slot the soundset supports no instrument for is dropped: shown dimmed
      // and unavailable, never asking to be filled.
      const dropped = supportedRoster(slot).length === 0;
      const cls = dropped ? 'unavailable' : owner ? 'filled' : 'empty';
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

  /** The persistent bottom-left strip of owned passives, one chip per item
   *  tinted its --voice-color. Rebuilt on every pick (cheap: <=10 chips). */
  renderItems(items: ReadonlyMap<ItemId, number>): void {
    this.itemStrip.replaceChildren();
    for (const [id, lvl] of items) {
      const def = ITEMS[id];
      const chip = el('span', 'item-chip', this.itemStrip, `${def.name} ${lvl}`);
      chip.style.setProperty('--voice-color', def.color);
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
   *  memorizing shortcuts). Always visible; toggles show their state. */
  mountDebug(actions: DebugAction[]): void {
    this.debugRow = el('div', 'debug-row', this.root);
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

  /** Re-read toggle states (hotkeys change them without a click). */
  refreshDebug(): void {
    for (const { btn, action } of this.debugButtons) {
      if (action.isOn) btn.classList.toggle('on', action.isOn());
      if (action.dynamicLabel) btn.textContent = `${action.dynamicLabel()} (${action.hotkey})`;
    }
  }

  /** Start screen: every run opens on the kick at tier 1 (non-negotiable for
   *  now) — pick a movement mode and go. */
  showStart(
    onStart: (role: Role, mode: AutoMoveMode) => void,
    onSandbox: () => void,
  ): void {
    let moveMode: AutoMoveMode = 'off';

    const s = this.newScreen();
    el('h1', '', s, 'Loop Survivors');
    el('p', 'sub', s, 'WASD or touch to move. Survive 8 minutes.');
    this.moveModeSelector(s, moveMode, (m) => {
      moveMode = m;
    });
    const startBtn = el('button', 'start-btn', s, 'start');
    startBtn.onclick = () => {
      this.closeScreen();
      onStart('kick', moveMode);
    };
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
  }

  /** Movement-mode picker on the start screen. Manual is the default; the two
   *  auto-move modes hand the player's movement to a mover — Kiter flees for
   *  survival, Greedy survives but chases XP for faster level-ups. The chosen
   *  run has no player movement input (no joystick on touch). */
  private moveModeSelector(
    parent: HTMLElement,
    current: AutoMoveMode,
    onChange: (mode: AutoMoveMode) => void,
  ): void {
    const opts: { mode: AutoMoveMode; label: string; hint: string }[] = [
      { mode: 'off', label: 'Manual', hint: 'You move. WASD or touch.' },
      {
        mode: 'kiter',
        label: 'Auto · Kiter',
        hint: 'Auto-pilot. Flees the horde, survival first. You can’t move.',
      },
      {
        mode: 'greedy',
        label: 'Auto · Greedy',
        hint: 'Auto-pilot. Survives but chases XP for faster level-ups. You can’t move.',
      },
    ];
    const wrap = el('div', 'move-mode', parent);
    el('span', 'move-mode-label', wrap, 'Movement');
    const row = el('div', 'move-mode-opts', wrap);
    const hint = el('p', 'move-mode-hint', wrap);
    const btns: HTMLButtonElement[] = [];
    const paint = (): void => {
      for (const [i, b] of btns.entries()) b.classList.toggle('on', opts[i].mode === current);
      hint.textContent = opts.find((o) => o.mode === current)!.hint;
    };
    for (const o of opts) {
      const btn = el('button', 'small', row, o.label) as HTMLButtonElement;
      btn.onclick = () => {
        current = o.mode;
        onChange(o.mode);
        paint();
        btn.blur();
      };
      btns.push(btn);
    }
    paint();
  }

  /** Level-up pick: up to three options from the pool of new weapons and
   *  tier-ups of owned ones. */
  showPick(options: PickOption[], onPick: (option: PickOption) => void): void {
    const s = this.newScreen();
    el('h2', '', s, 'Level up');
    const grid = el('div', 'pick-grid', s);
    const cards: HTMLElement[] = [];
    // Dev aid: mark offered weapons whose voice is sample-backed.
    const custom = sampledRoles();
    for (const option of options) {
      const card = this.kitCard(grid, option, () => {
        this.closeScreen();
        onPick(option);
      });
      if (option.kind === 'weapon' && custom.has(option.role)) {
        el('span', 'kit-custom-badge', card, '★ custom');
      }
      cards.push(card);
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
        // A mini damage-share bar fills the chip behind the label.
        chip.style.setProperty('--pct', `${pct}%`);
        chip.prepend(el('span', 'kill-bar', chip));
      }
    }
    const btn = el('button', 'big', s, 'run it back');
    btn.onclick = () => {
      this.closeScreen();
      onRetry();
    };
  }

  private kitCard(parent: HTMLElement, option: PickOption, onClick: () => void): HTMLElement {
    const card = el('button', 'kit-card', parent);
    if (option.kind === 'item') {
      const def = ITEMS[option.item];
      card.style.setProperty('--voice-color', def.color);
      el('span', 'kit-name', card, `${def.name} · Lv ${option.level}`);
      el('span', 'kit-desc', card, def.desc[option.level - 1]);
    } else if (option.kind === 'effect') {
      card.classList.add('kit-card--effect');
      const kit = this.kits.get(option.role)!;
      card.style.setProperty('--voice-color', kit.color);
      el('span', 'kit-slot-badge', card, SLOT_LABEL[slotOf(option.role)]);
      el('span', 'kit-name', card, `${kit.name} · ${EFFECT_META[option.effect].name}`);
      el('span', 'kit-desc', card, EFFECT_META[option.effect].line);
    } else {
      const kit = this.kits.get(option.role)!;
      card.style.setProperty('--voice-color', kit.color);
      // The slot badge names the band position this hire plugs, so every card
      // answers "what does taking this cost me?" at a glance (the band).
      el('span', 'kit-slot-badge', card, SLOT_LABEL[slotOf(option.role)]);
      el('span', 'kit-name', card, kit.name);
      el('span', 'kit-desc', card, TIER_LINES[option.role][option.tier - 1]);
      // Tier > 1 shows its numeral in the corner chip (the name stays plain).
      if (option.tier > 1) el('span', 'kit-tier', card, TIER_NUMERALS[option.tier - 1]);
    }
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
