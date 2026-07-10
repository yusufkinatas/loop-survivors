// All game UI is plain DOM overlaid on the canvas, cheap enough to throw
// away at M4 (docs/phases/m1-demo.md). Start screen, HUD, pick screen,
// end screens, and the hit flash.

import { type Kit, type Role } from '../audio/kits';
import { SLOTS, SLOT_LABEL, slotOf, supportedRoster, type Slot } from './band';
import { TIER_LINES } from './config';
import { type AutoMoveMode } from './input';
import type { PickOption } from './picks';

import { TIER_COUNT } from '../audio/charts';

/** Cards are terse by spec: name, tier numeral, one honest gameplay line,
 *  zero music description (docs/phases/m2-the-arc.md). */
export type { PickOption };

export const TIER_NUMERALS = ['I', 'II', 'III', 'IV'];

/** Small structural surface the start screen needs from a playable track.
 *  The audio layer owns the full profile; keeping this structural lets the HUD
 *  pass that same object back without importing or mutating the audio registry. */
export interface TrackChoice {
  id: string;
  title: string;
  artist?: string;
  roles: readonly Role[];
  startRole: Role;
}

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

/** The game shell owns audio state and bar-quantized scheduling; the HUD only
 * reads it and forwards a deck-cell click. Keeping this seam callback-based
 * also lets the pause copy render the exact same state as the arena deck. */
export interface TrackDeckHooks {
  isMuted(role: Role): boolean;
  pendingMute(slot: Slot): boolean | undefined;
  canToggle(): boolean;
  onToggle(slotIndex: number): void;
}

export class Hud {
  private root: HTMLElement;
  private bar: HTMLElement;
  private trackTitle: HTMLElement;
  private hpFill: HTMLElement;
  private xpFill: HTMLElement;
  private timer: HTMLElement;
  private levelEl: HTMLElement;
  private flash: HTMLElement;
  private pulse: HTMLElement;
  private toastStack: HTMLElement;
  private rack: HTMLElement;
  private trackCells = new Map<Role, HTMLElement>();
  private trackDeckHooks: TrackDeckHooks | null = null;
  private screen: HTMLElement | null = null;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;
  private kits: Map<Role, Kit>;
  private catalog: readonly Role[] | undefined;
  private debugRow: HTMLElement | null = null;
  private debugButtons: { btn: HTMLElement; action: DebugAction }[] = [];

  constructor(root: HTMLElement, kits: Map<Role, Kit>) {
    this.root = root;
    this.kits = kits;

    // Glass transport panel: timer + level chip on top, then the HP and XP
    // meters (each with a fill and a faint cap label).
    this.bar = el('div', 'hud', root);
    this.trackTitle = el('div', 'hud-genre', this.bar);
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
    this.toastStack.setAttribute('role', 'status');
    this.toastStack.setAttribute('aria-live', 'polite');
    this.toastStack.setAttribute('aria-atomic', 'false');
    // The live track deck: eight stable slots in a compact, non-scrolling 4x2.
    this.rack = el('div', 'track-deck', root);
    this.rack.style.display = 'none';
  }

  showHud(show: boolean): void {
    this.bar.style.display = show ? '' : 'none';
    this.rack.style.display = show ? '' : 'none';
  }

  /** Refresh the selected track's visible catalog and voicing. The audio layer
   *  may replace kit objects while switching tracks, so the HUD takes a fresh
   *  map instead of retaining the boot-time House labels. */
  setTrackContext(title: string, catalog: readonly Role[], kits?: Map<Role, Kit>): void {
    this.trackTitle.textContent = title;
    this.catalog = [...catalog];
    if (kits) this.kits = kits;
  }

  configureTrackDeck(hooks: TrackDeckHooks): void {
    this.trackDeckHooks = hooks;
  }

  /** Eight fixed track cells in SLOTS order. The normal game owns one role per
   *  slot; the sandbox can force several, in which case the cell represents the
   *  whole slot group and shows the first name plus a count. */
  renderBand(tiers: ReadonlyMap<Role, number>, into: HTMLElement = this.rack): void {
    into.replaceChildren();
    const isMainDeck = into === this.rack;
    if (isMainDeck) this.trackCells.clear();

    for (const [slotIndex, slot] of SLOTS.entries()) {
      const roster = supportedRoster(slot, this.catalog);
      const owners = roster.filter((role) => tiers.has(role));
      const owner = owners[0];
      const dropped = roster.length === 0;
      const mutedCount = owners.filter((role) => this.trackDeckHooks?.isMuted(role)).length;
      const muted = owners.length > 0 && mutedCount === owners.length;
      const mixed = mutedCount > 0 && !muted;
      const pending = this.trackDeckHooks?.pendingMute(slot);
      const interactive = Boolean(owner && !dropped && this.trackDeckHooks?.canToggle());
      const classes = [
        'track-cell',
        dropped ? 'unavailable' : owner ? 'filled' : 'empty',
        muted ? 'muted' : '',
        mixed ? 'mixed' : '',
        pending !== undefined ? 'pending' : '',
        interactive ? 'interactive' : '',
      ]
        .filter(Boolean)
        .join(' ');
      const cell = el('button', classes, into) as HTMLButtonElement;
      cell.type = 'button';
      cell.disabled = !interactive;

      const head = el('span', 'track-head', cell);
      el('span', 'track-key', head, String(slotIndex + 1));
      el('span', 'track-slot', head, SLOT_LABEL[slot]);
      el('span', 'track-trigger', head);

      const kit = owner ? this.kits.get(owner)! : null;
      if (kit) cell.style.setProperty('--voice-color', kit.color);
      const name = kit ? (owners.length > 1 ? `${kit.name} +${owners.length - 1}` : kit.name) : 'empty';
      el('span', 'track-name', cell, name);

      const foot = el('span', 'track-foot', cell);
      const pips = el('span', 'track-pips', foot);
      const tier = owner ? (tiers.get(owner) ?? 1) : 0;
      for (let i = 1; i <= TIER_COUNT; i++) el('span', `pip ${i <= tier ? 'on' : ''}`, pips);
      const status =
        pending !== undefined ? (pending ? 'next off' : 'next on') : muted ? 'off' : mixed ? 'mixed' : '';
      el('span', 'track-state', foot, status);

      if (owner) {
        const action = pending !== undefined ? status : muted ? 'audio off' : 'audio on';
        cell.title = `${slotIndex + 1} · ${SLOT_LABEL[slot]} · ${name} · ${action}`;
        cell.setAttribute('aria-label', `${SLOT_LABEL[slot]} track, ${name}, ${action}`);
        cell.onclick = () => this.trackDeckHooks?.onToggle(slotIndex);
        if (isMainDeck) for (const role of owners) this.trackCells.set(role, cell);
      } else {
        cell.setAttribute('aria-label', `${SLOT_LABEL[slot]} track, empty`);
      }
    }
  }

  /** A scheduled trigger briefly lights its slot. Muted tracks still pulse so
   *  the developer can see that gameplay is continuing behind the monitor mute. */
  pulseTrack(role: Role): void {
    const cell = this.trackCells.get(role);
    if (!cell) return;
    cell.classList.remove('firing');
    void cell.offsetWidth;
    cell.classList.add('firing');
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

  /** Debug buttons mirror the hotkeys but live behind one compact disclosure,
   *  keeping the arena free of a permanent button ribbon. */
  mountDebug(actions: DebugAction[]): void {
    const panel = el('details', 'debug-panel', this.root);
    el('summary', 'debug-summary', panel, 'DEV');
    this.debugRow = el('div', 'debug-actions', panel);
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

  /** Start screen: choose one audition track, then start. Autoplay and
   *  workrooms remain deliberately nested under Developer tools. */
  showStart<T extends TrackChoice>(
    tracks: readonly T[],
    onStart: (track: T, role: Role, mode: AutoMoveMode) => void,
    onSandbox: (track: T) => void,
  ): void {
    let moveMode: AutoMoveMode = 'off';
    let selected: T | null = null;

    const s = this.newScreen();
    el('h1', '', s, 'Loop Survivors');
    el('p', 'sub', s, 'Choose the track you want to build. Then survive 8 minutes.');

    const chooser = el('div', 'start-track-grid', s);
    const trackButtons: HTMLButtonElement[] = [];
    for (const track of tracks) {
      const btn = el('button', 'start-track-card', chooser) as HTMLButtonElement;
      btn.setAttribute('aria-pressed', 'false');
      el('span', 'start-track-title', btn, track.title);
      if (track.artist) el('span', 'start-track-artist', btn, track.artist);
      btn.onclick = () => {
        selected = track;
        for (const option of trackButtons) {
          const on = option === btn;
          option.classList.toggle('on', on);
          option.setAttribute('aria-pressed', String(on));
        }
        startBtn.disabled = false;
        startBtn.textContent = `start ${track.title}`;
        btn.blur();
      };
      trackButtons.push(btn);
    }

    const startBtn = el('button', 'start-btn', s, 'choose a track') as HTMLButtonElement;
    startBtn.disabled = true;
    startBtn.onclick = () => {
      if (!selected) return;
      this.closeScreen();
      onStart(selected, selected.startRole, moveMode);
    };
    const secondary = el('div', 'start-secondary', s);
    const bossBtn = el('button', 'small', secondary, 'boss fights');
    bossBtn.onclick = () => {
      location.hash = '#boss';
    };

    const tools = el('details', 'start-dev-tools', s);
    el('summary', 'start-dev-summary', tools, 'Developer tools');
    const toolsBody = el('div', 'start-dev-body', tools);
    this.moveModeSelector(toolsBody, moveMode, (m) => {
      moveMode = m;
    });
    const links = el('div', 'start-dev-links', toolsBody);
    const sandboxBtn = el('button', 'small', links, 'sandbox');
    sandboxBtn.onclick = () => {
      const track = selected ?? tracks[0];
      if (!track) return;
      this.closeScreen();
      onSandbox(track);
    };
    const roomBtn = el('button', 'small', links, 'rehearsal room');
    roomBtn.onclick = () => {
      location.hash = '#rehearsal';
    };
    const labBtn = el('button', 'small', links, 'experimentation room');
    labBtn.onclick = () => {
      location.hash = '#tracklab';
    };
  }

  /** Movement-mode picker on the start screen. Manual is the default; the two
   *  auto-move modes hand the player's movement to a mover — Kiter flees for
   *  survival, while Greedy takes risks to sweep through nearby XP. The chosen
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
        hint: 'Auto-pilot. Takes more risks to sweep through nearby XP. You can’t move.',
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
    for (const option of options) {
      const card = this.kitCard(grid, option, () => {
        this.closeScreen();
        onPick(option);
      });
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
    const kit = this.kits.get(option.role)!;
    card.style.setProperty('--voice-color', kit.color);
    el('span', 'kit-slot-badge', card, SLOT_LABEL[slotOf(option.role)]);
    el('span', 'kit-name', card, kit.name);
    el('span', 'kit-desc', card, TIER_LINES[option.role][option.tier - 1]);
    if (option.tier > 1) el('span', 'kit-tier', card, TIER_NUMERALS[option.tier - 1]);
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
