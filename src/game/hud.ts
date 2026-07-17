// All game UI is plain DOM overlaid on the canvas, cheap enough to throw
// away and rebuild later. Start screen, HUD, end screens, and
// the hit flash. Level-up picks are now dropped in-world (see game.ts /
// view.ts), not a DOM screen.

import { type Kit, type Role } from '../audio/kits';
import { SLOTS, SLOT_LABEL, ownerOfSlot, supportedRoster } from './band';
import { EVOLUTION_BY_ROLE, ITEMS, type ItemId } from './items';
import type { MetaStore, RunSettlement } from './meta';
import { VENUES, isVenueId } from './tour';

import { TIER_COUNT } from '../audio/charts';
/** Tier numerals used by the band rack. */
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
  private noteEl: HTMLElement;
  private flash: HTMLElement;
  private pulse: HTMLElement;
  private toastStack: HTMLElement;
  private rack: HTMLElement;
  private itemRack: HTMLElement;
  private pressureFill: HTMLElement;
  private pressureLabel: HTMLElement;
  private venueLabel: HTMLElement;
  private rerollButton: HTMLButtonElement;
  private runInfoKey = '';
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
    this.venueLabel = el('span', 'hud-venue', top, 'NEON ALLEY');
    this.noteEl = el('span', 'hud-notes', top, '♫ 0');
    const hp = el('div', 'meter hp', this.bar);
    this.hpFill = el('div', 'fill', hp);
    el('span', 'meter-cap', hp, 'HP');
    const xp = el('div', 'meter xp', this.bar);
    this.xpFill = el('div', 'fill', xp);
    const pressure = el('div', 'meter pressure', this.bar);
    this.pressureFill = el('div', 'fill', pressure);
    this.pressureLabel = el('span', 'meter-cap pressure-cap', pressure, 'PRESSURE 0%');
    this.bar.style.display = 'none';

    this.flash = el('div', 'hit-flash', root);
    this.pulse = el('div', 'level-pulse', root);
    this.toastStack = el('div', 'toast-stack', root);
    // The band rack: seven sockets, one per band position, empty until hired.
    this.rack = el('div', 'band-rack', root);
    this.rack.style.display = 'none';
    this.itemRack = el('div', 'item-rack', root);
    this.itemRack.style.display = 'none';
    this.rerollButton = el('button', 'reroll-live', root, 'REROLL') as HTMLButtonElement;
    this.rerollButton.style.display = 'none';
  }

  showHud(show: boolean, sandbox = false): void {
    this.bar.style.display = show ? '' : 'none';
    this.rack.style.display = show ? '' : 'none';
    // The sandbox owns a complete Build/Career inspector. Hiding the live-run
    // item rack and reroll button prevents two overlapping control surfaces.
    this.itemRack.style.display = show && !sandbox ? '' : 'none';
    this.rerollButton.style.display = show && !sandbox ? '' : 'none';
  }

  setRerollAction(action: () => void): void {
    this.rerollButton.onclick = action;
  }

  setRunInfo(
    items: ReadonlyMap<ItemId, number>,
    evolved: ReadonlySet<Role>,
    pressureHeat: number,
    pressureState: string,
    venue: string,
    chapter: number,
    rerolls: number,
    notesCollected: number,
  ): void {
    const itemPart = [...items].map(([id, level]) => `${id}:${level}`).join('|');
    const evolvedPart = [...evolved].join('|');
    const key = `${itemPart}/${evolvedPart}/${Math.round(pressureHeat)}/${pressureState}/${venue}/${chapter}/${rerolls}/${notesCollected}`;
    if (key === this.runInfoKey) return;
    this.runInfoKey = key;
    const venueName = isVenueId(venue) ? VENUES[venue].name : venue.replace(/([A-Z])/g, ' $1');
    this.venueLabel.textContent = `${venueName.toUpperCase()} · SET ${chapter + 1}`;
    this.pressureFill.style.width = `${Math.max(0, Math.min(100, pressureHeat))}%`;
    this.pressureLabel.textContent = pressureState === 'break'
      ? 'HOLD THE DROP'
      : pressureState === 'armed'
        ? 'PRESSURE ARMED'
        : `PRESSURE ${Math.round(pressureHeat)}%`;
    this.pressureLabel.classList.toggle('armed', pressureState === 'armed' || pressureState === 'break');
    this.pressureFill.classList.toggle('armed', pressureState === 'armed' || pressureState === 'break');
    this.rerollButton.textContent = `REROLL ×${rerolls}`;
    this.rerollButton.disabled = rerolls <= 0;
    this.noteEl.textContent = `♫ ${notesCollected}`;
    this.itemRack.replaceChildren();
    for (let slot = 0; slot < 6; slot++) {
      const entry = [...items][slot];
      const socket = el('div', `item-socket ${entry ? 'filled' : 'empty'}`, this.itemRack);
      if (!entry) {
        el('span', 'item-glyph', socket, '·');
        continue;
      }
      const [id, level] = entry;
      const item = ITEMS[id];
      socket.style.setProperty('--item-color', `#${item.color.toString(16).padStart(6, '0')}`);
      el('span', 'item-glyph', socket, item.glyph);
      el('span', 'item-name', socket, item.shortName);
      el('span', 'item-tier', socket, String(level));
      socket.title = `${item.name} ${level}: ${item.levelLines[level - 1]}`;
    }
  }

  /** The band rack: seven typed sockets in rack
   *  order, empty ones asking to be filled, filled ones showing the hired
   *  instrument (its color + name) and its tier as pips. Rebuilt on every pick
   *  (cheap: 7 sockets). Renders into the HUD rack by default, or any supplied
   *  container so the pause menu can show the same band. The dev number-key
   *  toggles mark a deactivated owner's socket dimmed, and a socket with a
   *  change scheduled for the next bar pulses (up from dim toward on, or down
   *  from full toward off). */
  renderBand(
    tiers: ReadonlyMap<Role, number>,
    into: HTMLElement = this.rack,
    deactivated?: ReadonlySet<Role>,
    pending?: ReadonlySet<Role>,
    evolved?: ReadonlySet<Role>,
  ): void {
    into.replaceChildren();
    for (const slot of SLOTS) {
      const owner = ownerOfSlot(slot, tiers);
      // A slot the soundset supports no instrument for is dropped: shown dimmed
      // and unavailable, never asking to be filled.
      const dropped = supportedRoster(slot).length === 0;
      let cls = dropped ? 'unavailable' : owner ? 'filled' : 'empty';
      if (owner && !dropped) {
        const off = deactivated?.has(owner) ?? false;
        const pend = pending?.has(owner) ?? false;
        // Pending pulses from the CURRENT settled state toward its opposite;
        // a settled-off socket with no pending change just sits dimmed.
        if (pend) cls += off ? ' pending-on' : ' pending-off';
        else if (off) cls += ' deactivated';
        if (evolved?.has(owner)) cls += ' evolved';
      }
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
    this.timer.textContent = formatTime(timeS);
  }

  /** The `.hit-flash` edge-tint element. The shared damage-feedback helper
   *  (damage-feedback.ts) drives it so every arena flashes identically. */
  get flashEl(): HTMLElement {
    return this.flash;
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
    let open = localStorage.getItem(KEY) === '1' && !matchMedia('(max-width: 720px)').matches;
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
    meta?: MetaStore,
    shopOpen = false,
    shopScrollTop = 0,
  ): void {
    const s = this.newScreen();
    s.classList.add('start-screen');
    const hero = el('div', 'start-hero', s);
    const art = document.createElement('img');
    art.className = 'title-art';
    art.src = '/art/soundwood-title.png';
    art.alt = 'A neon pixel-art DJ stage surrounded by strange signal creatures in the Soundwood';
    hero.appendChild(art);
    const title = el('div', 'title-lockup', hero);
    el('span', 'eyebrow', title, 'THE INFINITE NIGHT TOUR');
    el('h1', '', title, 'LOOP SURVIVORS');
    el('p', 'sub', title, 'Build the track. Draw the arena. Survive until the crowd wins.');

    if (meta) {
      const profile = el('div', 'career-panel', s);
      const collectionProgress = meta.collection();
      const head = el('div', 'career-head', profile);
      el('strong', 'career-rank', head, 'AFTERHOURS COLLECTION');
      el('span', 'career-rep', head, `♫ ${meta.state.notes} MUSIC NOTES`);
      const bar = el('div', 'rank-meter', profile);
      const fill = el('div', 'rank-meter-fill', bar);
      fill.style.width = `${collectionProgress.ratio * 100}%`;
      el('span', 'rank-meter-copy', bar, collectionProgress.complete
        ? 'COLLECTION COMPLETE'
        : `${collectionProgress.owned} / ${collectionProgress.total} SHOP UNLOCKS`);
      const rewards = el('div', 'next-reward', profile);
      el('span', 'eyebrow', rewards, 'PLAYER-DIRECTED PROGRESSION');
      el('strong', '', rewards, collectionProgress.complete
        ? 'Every shelf of the Afterhours Shop is yours.'
        : 'Defeat The Hush, collect its music notes, then choose what unlocks next.');
      el('span', 'reward-copy', rewards,
        'Collected notes bank when the set ends. Shop purchases unlock new instruments, passives, venues, and perks.');

      const collection = el('div', 'collection-strip', profile);
      el('span', '', collection, `${meta.state.unlockedWeapons.length}/9 WEAPONS`);
      el('span', '', collection, `${meta.state.unlockedItems.length}/9 PASSIVES`);
      el('span', '', collection, `${meta.state.unlockedVenues.length}/6 VENUES`);
      el('span', '', collection, `${meta.state.rerolls} REROLLS`);

      if (meta.hasPurchase('startItem')) {
        const loadout = el('div', 'start-loadout', profile);
        el('span', 'eyebrow', loadout, 'STARTING PASSIVE');
        const choices = el('div', 'loadout-choices', loadout);
        const noneButton = el(
          'button',
          `loadout-chip ${meta.state.startItem === undefined ? 'selected' : ''}`,
          choices,
          'NO PASSIVE',
        ) as HTMLButtonElement;
          noneButton.onclick = () => {
            meta.selectStartItem(undefined);
            this.showStart(onStart, onSandbox, meta, shopOpen, s.scrollTop);
          };
        for (const id of meta.state.unlockedItems) {
          const item = ITEMS[id];
          const button = el('button', `loadout-chip ${meta.state.startItem === id ? 'selected' : ''}`, choices,
            `${item.glyph} ${item.name}`) as HTMLButtonElement;
            button.onclick = () => {
              meta.selectStartItem(id);
              this.showStart(onStart, onSandbox, meta, shopOpen, s.scrollTop);
            };
        }
      }

      const mastery = Object.entries(meta.state.mastery) as [Role, { damage: number; kills: number; evolutions: number }][];
      const revealed = mastery.filter(([, value]) => value.damage >= 100_000);
      if (revealed.length > 0) {
        const hints = el('div', 'recipe-hints', profile);
        el('span', 'eyebrow', hints, 'MASTERY REVEALED');
        for (const [role] of revealed.slice(0, 3)) {
          const recipe = EVOLUTION_BY_ROLE[role];
          if (recipe) el('span', 'recipe-chip', hints, `${this.kits.get(role)?.name ?? role} + ${ITEMS[recipe.item].name} → ${recipe.name}`);
        }
      }

      const shopToggle = el('button', 'shop-toggle', profile,
        shopOpen ? 'CLOSE AFTERHOURS SHOP' : 'OPEN AFTERHOURS SHOP') as HTMLButtonElement;
      const shop = el('section', 'shop-panel', profile);
      shop.style.display = shopOpen ? '' : 'none';
      const shopHead = el('div', 'shop-head', shop);
      const shopTitle = el('div', '', shopHead);
      el('span', 'eyebrow', shopTitle, 'SPEND MUSIC NOTES');
      el('strong', '', shopTitle, 'AFTERHOURS SHOP');
      const shopHeadActions = el('div', 'shop-head-actions', shopHead);
      el('span', 'shop-wallet', shopHeadActions, `♫ ${meta.state.notes}`);
      const shopClose = el('button', 'shop-close', shopHeadActions, 'CLOSE SHOP') as HTMLButtonElement;
      const shopGrid = el('div', 'shop-grid', shop);
      for (const status of meta.shop()) {
        const { offer } = status;
        const stateClass = status.purchased
          ? 'purchased'
          : status.shelfLocked
            ? 'locked'
            : status.affordable
              ? 'available'
              : 'short';
        const card = el('article', `shop-card ${stateClass}`, shopGrid);
        const cardTop = el('div', 'shop-card-top', card);
        el('span', 'shop-kind', cardTop, offer.kind.toUpperCase());
        el('span', 'shop-cost', cardTop, status.purchased ? 'OWNED' : `♫ ${offer.cost}`);
        el('strong', 'shop-name', card, offer.name);
        el('span', 'shop-copy', card, offer.description);
        const buy = el('button', 'shop-buy', card, status.purchased
          ? 'PURCHASED'
          : status.shelfLocked
            ? `BUY ${status.purchasesNeeded} MORE TO REVEAL`
            : status.affordable
              ? `UNLOCK FOR ♫ ${offer.cost}`
              : `NEED ♫ ${offer.cost - meta.state.notes} MORE`) as HTMLButtonElement;
        buy.disabled = status.purchased || status.shelfLocked || !status.affordable;
        buy.onclick = () => {
          if (!meta.purchase(offer.id)) return;
          const scrollTop = s.scrollTop;
          this.showToast(`SHOP UNLOCK · ${offer.name.toUpperCase()}`);
          this.showStart(onStart, onSandbox, meta, true, scrollTop);
        };
      }
      shopToggle.onclick = () => {
        const opening = shop.style.display === 'none';
        shop.style.display = opening ? '' : 'none';
        shopToggle.textContent = opening ? 'CLOSE AFTERHOURS SHOP' : 'OPEN AFTERHOURS SHOP';
        shopToggle.classList.toggle('on', opening);
      };
      shopToggle.classList.toggle('on', shopOpen);
      shopClose.onclick = () => {
        shop.style.display = 'none';
        shopToggle.textContent = 'OPEN AFTERHOURS SHOP';
        shopToggle.classList.remove('on');
        shopToggle.focus();
      };
    }

    const startBtn = el('button', 'start-btn', s, 'ENTER THE SOUNDWOOD');
    startBtn.onclick = () => {
      this.closeScreen();
      onStart('kick');
    };
    el('p', 'start-hint', s,
      'WASD / arrow keys / touch to move · collect blue XP and gold music notes · walk onto reward pedestals · R rerolls');
    // Below the primary CTA, two menu buttons: sandbox launches directly,
    // experiments is a disclosure for the standalone playtest surfaces (boss
    // fights, full tracks, rehearsal room — mirrors src/experiments/).
    const dev = el('div', 'start-dev', s);
    const menuRow = el('div', 'start-dev-row', dev);
    const sandboxBtn = el('button', 'small start-dev-toggle', menuRow, 'sandbox');
    const experimentsToggle = el('button', 'small start-dev-toggle', menuRow, 'experiments');

    const experimentsRow = el('div', 'start-dev-row', dev);
    experimentsRow.style.display = 'none';
    const bossBtn = el('button', 'small', experimentsRow, 'boss fights');
    const tracksBtn = el('button', 'small', experimentsRow, 'full tracks');
    const roomBtn = el('button', 'small', experimentsRow, 'rehearsal room');

    experimentsToggle.onclick = () => {
      const open = experimentsRow.style.display === 'none';
      experimentsRow.style.display = open ? '' : 'none';
      experimentsToggle.classList.toggle('on', open);
      (experimentsToggle as HTMLButtonElement).blur();
    };
    sandboxBtn.onclick = () => {
      this.closeScreen();
      onSandbox();
    };
    bossBtn.onclick = () => {
      location.hash = '#boss';
    };
    tracksBtn.onclick = () => {
      location.hash = '#tracklab';
    };
    roomBtn.onclick = () => {
      location.hash = '#rehearsal';
    };
    if (shopScrollTop > 0) {
      requestAnimationFrame(() => {
        if (this.screen === s) s.scrollTop = Math.min(shopScrollTop, s.scrollHeight - s.clientHeight);
      });
    }
  }

  /** Transient notices stack instead of overlapping, animate in and out,
   *  and cap at four. */
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
   *  kill counts flatter AoE last hits and hide single-target work on tanks. */
  showEnd(
    _victory: boolean,
    stats: {
      timeS: number;
      kills: number;
      level: number;
      notesCollected: number;
      damageByRole: Partial<Record<Role, number>>;
      killsByRole: Partial<Record<Role, number>>;
    },
    onRetry: () => void,
    settlement?: RunSettlement,
  ): void {
    const s = this.newScreen();
    s.classList.add('end-screen');
    el('span', 'eyebrow', s, 'THE CROWD FINALLY WON');
    el('h1', '', s, 'SET ENDED');
    el('p', 'sub run-summary', s,
      `${formatTime(stats.timeS)} · ${stats.kills} kills · level ${stats.level} · ♫ ${stats.notesCollected}`);

    if (settlement) {
      const rep = el('section', 'settlement-panel', s);
      const earned = el('div', 'rep-earned', rep);
      const earnedCopy = el('div', '', earned);
      el('span', 'eyebrow', earnedCopy, 'MUSIC NOTES BANKED');
      el('span', 'reward-copy', earnedCopy,
        `${settlement.walletBefore} before this set · ${settlement.walletAfter} now available`);
      el('strong', '', earned, `+♫ ${settlement.notesEarned}`);
      const breakdown = el('div', 'rep-breakdown', rep);
      for (const [label, value] of [
        ['COLLECTION', `${settlement.collection.owned} / ${settlement.collection.total}`],
        ['NEW MILESTONES', String(settlement.newMilestones.length)],
        ['NEW VENUES SEEN', String(settlement.newVenues.length)],
      ] as const) {
        const row = el('div', 'rep-row', breakdown);
        el('span', '', row, label);
        el('strong', '', row, value);
      }
      const rank = el('div', 'end-rank', rep);
      el('strong', '', rank, 'AFTERHOURS COLLECTION');
      const meter = el('div', 'rank-meter', rank);
      const fill = el('div', 'rank-meter-fill', meter);
      fill.style.width = `${settlement.collection.ratio * 100}%`;
      el('span', 'rank-meter-copy', meter, settlement.collection.complete
        ? 'COLLECTION COMPLETE'
        : `${settlement.collection.owned} / ${settlement.collection.total} UNLOCKS`);
      if (settlement.newMilestones.length > 0) {
        el('p', 'milestone-line', rep,
          `MILESTONES · ${settlement.newMilestones.map((id) => id.replace(/([A-Z])/g, ' $1')).join(' · ')}`);
      }
      const next = el('div', 'next-reward end-next', rep);
      el('span', 'eyebrow', next, settlement.collection.complete
        ? 'FULL TOUR COLLECTION'
        : 'YOUR NEXT UNLOCK IS YOUR CHOICE');
      el('strong', '', next, settlement.collection.complete
        ? 'The Afterhours Shop is sold out.'
        : 'Return to the Afterhours Shop and spend your music notes.');
    }
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
    const btn = el('button', 'big retry-btn', s, 'ONE MORE SET');
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

function formatTime(timeS: number): string {
  const whole = Math.max(0, Math.floor(timeS));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const seconds = whole % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${minutes}:${String(seconds).padStart(2, '0')}`;
}
