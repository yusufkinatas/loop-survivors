// All game UI is plain DOM overlaid on the canvas, cheap enough to throw
// away at M4 (docs/phases/m1-demo.md). Start screen, HUD, pick screen,
// end screens, and the hit flash.

import { type Kit, type Role } from '../audio/kits';
import { supportedRoles, type Genre, type GenreId } from '../audio/genres';
import { sampledRoles } from '../audio/kits/index';
import { SLOTS, SLOT_LABEL, ownerOfSlot, slotOf, startableRoles, supportedRoster, type Slot } from './band';
import type { RunWorld } from './run';
import { HOLD, TIER_LINES } from './config';
import { EFFECT_META } from './effects';
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
  /** Live HUD-rack socket elements so per-frame hold/charge visuals can update
   *  them without rebuilding the rack. Keyed by band slot. */
  private sockets = new Map<Slot, HTMLElement>();
  private tensionEl: HTMLElement;
  private tensionFill: HTMLElement;
  /** "×1.9" danger-multiplier tag: why the charge is filling fast right now. */
  private tensionMul: HTMLElement;
  /** "DROP [Q]" prompt: lit when a real drop is ready, greyed when too weak. */
  private dropPrompt: HTMLElement;
  private screen: HTMLElement | null = null;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;
  private kits: Map<Role, Kit>;
  /** The active genre, so the rack can mark slots this genre drops. */
  private genreId: GenreId | null = null;
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

    // Drop-charge meter: fills with the summed charge of the armed (closed)
    // instruments — a live preview of how big the pending drop is. The ×N tag
    // shows the danger multiplier (why it fills fast); the DROP prompt teaches
    // the commit verb (Hold & Drop v2.1).
    this.tensionEl = el('div', 'tension-meter', root);
    el('span', 'tension-cap', this.tensionEl, 'DROP');
    const track = el('div', 'tension-track', this.tensionEl);
    this.tensionFill = el('div', 'tension-fill', track);
    this.tensionMul = el('span', 'tension-mul', this.tensionEl);
    this.dropPrompt = el('span', 'drop-prompt', this.tensionEl, 'DROP [Q]');
    this.tensionEl.style.display = 'none';
  }

  showHud(show: boolean): void {
    this.bar.style.display = show ? '' : 'none';
    this.itemStrip.style.display = show ? '' : 'none';
    this.rack.style.display = show ? '' : 'none';
    this.tensionEl.style.display = show ? '' : 'none';
  }

  /** Tell the rack which genre is active, so slots this genre drops (supports
   *  no instrument for) render as unavailable rather than askable-to-fill. */
  setGenre(genreId: GenreId): void {
    this.genreId = genreId;
  }

  /** The band rack (docs/phases/the-band.md): eight typed sockets in rack
   *  order, empty ones asking to be filled, filled ones showing the hired
   *  instrument (its color + name) and its tier as pips. Rebuilt on every pick
   *  (cheap: 8 sockets). Renders into the HUD rack by default, or any supplied
   *  container so the pause menu can show the same band. */
  renderBand(tiers: ReadonlyMap<Role, number>, into: HTMLElement = this.rack): void {
    into.replaceChildren();
    const live = into === this.rack;
    if (live) this.sockets.clear();
    SLOTS.forEach((slot, i) => {
      const owner = ownerOfSlot(slot, tiers);
      // A slot the active genre supports no instrument for is dropped: shown
      // dimmed and unavailable, never asking to be filled.
      const dropped =
        this.genreId !== null && supportedRoster(this.genreId, slot).length === 0;
      const cls = dropped ? 'unavailable' : owner ? 'filled' : 'empty';
      const socket = el('div', `band-socket ${cls}`, into);
      // The number key that pulls this band position back / brings it in
      // (Hold & Drop). A dropped slot offers nothing to interact with.
      if (!dropped) el('span', 'socket-key', socket, String(i + 1));
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
        // The charge ring overlay (filled per-frame by updateHold).
        el('span', 'socket-charge', socket);
      }
      if (live) this.sockets.set(slot, socket);
    });
  }

  /** Per-frame Hold & Drop visuals (v2.1): each armed socket is a capacitor
   *  filling in its own color (the per-voice charge gauge); the meter previews
   *  the summed drop size with a danger-multiplier tag; a DROP prompt teaches
   *  the commit verb and shows when a drop is ready vs too weak. Cheap: 8
   *  sockets. */
  updateHold(world: RunWorld): void {
    for (const [slot, socket] of this.sockets) {
      const owner = ownerOfSlot(slot, world.tiers);
      if (!owner) continue;
      const armed = world.held.has(owner);
      const charge = armed ? world.chargeOf(owner) : 0;
      socket.classList.toggle('held', armed);
      socket.classList.toggle('charged', armed && charge > 0.98);
      socket.classList.toggle('payoff', world.inPayoff(owner));
      socket.style.setProperty('--charge', charge.toFixed(3));
    }
    const t = world.tension01();
    const armedCount = world.held.size;
    this.tensionFill.style.width = `${t * 100}%`;
    this.tensionEl.classList.toggle('active', t > 0.001 || armedCount > 0);
    this.tensionEl.classList.toggle('hot', t > 0.66);
    this.tensionEl.classList.toggle('overflow', world.tensionOverflow());
    this.tensionEl.classList.toggle('cooldown', world.dropOnCooldown());
    // Danger multiplier tag: shows why charge is filling fast (×1 safe → ×3
    // surrounded). Only meaningful while something is armed.
    const mul = 1 + (HOLD.charge.dangerMul - 1) * world.danger01();
    const showMul = armedCount > 0 && mul > 1.05;
    this.tensionMul.textContent = showMul ? `×${mul.toFixed(1)}` : '';
    this.tensionEl.classList.toggle('danger', showMul && mul > 2);
    // DROP prompt: ready (lit) when a real drop is loaded and off cooldown;
    // "too weak" (greyed) when armed but below the fizzle floor.
    const ready = armedCount > 0 && !world.dropOnCooldown() && world.chargeSum() >= HOLD.charge.fizzleBelow;
    const tooWeak = armedCount > 0 && !ready && !world.dropOnCooldown();
    this.dropPrompt.classList.toggle('ready', ready);
    this.dropPrompt.classList.toggle('weak', tooWeak);
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
      el('p', 'sub', s, `${genre.name} has its own sound and its own instruments.`);
      const grid = el('div', 'pick-grid', s);
      const cards: HTMLElement[] = [];
      // FX is barred from the starting offer (design rule 5) — a tier-1 FX
      // voice is near-silent for minutes, a dead opener — and only this genre's
      // supported instruments are offered.
      const custom = sampledRoles(genre.id); // dev aid: which voices are sampled
      for (const role of startableRoles(supportedRoles(genre.id))) {
        const card = this.kitCard(grid, { kind: 'weapon', role, tier: 1 }, () => {
          this.closeScreen();
          onStart(genre, role);
        });
        // ★ custom marks a voice that is sample-backed for this genre (dev only),
        // matching the sandbox loadout badge.
        if (custom.has(role)) el('span', 'kit-custom-badge', card, '★ custom');
        cards.push(card);
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
    // Dev aid: mark offered weapons whose voice is sample-backed for the genre.
    const custom = this.genreId !== null ? sampledRoles(this.genreId) : new Set<Role>();
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
