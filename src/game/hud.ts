// All game UI is plain DOM overlaid on the canvas, cheap enough to throw
// away and rebuild later. Start screen, HUD, end screens, and
// the hit flash. Level-up picks are now dropped in-world (see game.ts /
// view.ts), not a DOM screen.

import { type Kit, type Role } from '../audio/kits';
import { SLOTS, SLOT_LABEL, ownerOfSlot, supportedRoster } from './band';
import { EVOLUTION_BY_ROLE, ITEM_IDS, ITEMS, type ItemId } from './items';
import type { MetaStore, RunSettlement } from './meta';

import { TIER_COUNT } from '../audio/charts';
/** Tier numerals used by the band rack. */
export const TIER_NUMERALS = ['I', 'II', 'III', 'IV'];

type HudPixelIcon = ItemId |
  'heart' | 'xp' | 'note' | 'level' | 'pause' |
  'reroll' | 'shop' | 'evolution' | 'weapon-pedestal' | 'enemy-skull';

const HUD_PIXEL_ICON_INDEX: Record<HudPixelIcon, number> = {
  highTops: 0,
  fastForward: 1,
  needleTips: 2,
  mirrorball: 3,
  wideLens: 4,
  heavyAmp: 5,
  extensionCable: 6,
  magnetLanyard: 7,
  paddedJacket: 8,
  recoveryTape: 9,
  heart: 10,
  xp: 11,
  note: 12,
  level: 13,
  pause: 14,
  reroll: 15,
  shop: 16,
  evolution: 17,
  'weapon-pedestal': 18,
  'enemy-skull': 19,
};

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
    const levelChip = el('span', 'hud-level', top);
    pixelIcon(levelChip, 'level', 'hud-status-icon');
    this.levelEl = el('span', 'hud-level-value', levelChip, 'LV 1');
    const noteChip = el('span', 'hud-notes', top);
    pixelIcon(noteChip, 'note', 'hud-status-icon');
    this.noteEl = el('span', 'hud-note-value', noteChip, '0');
    const hp = el('div', 'meter hp', this.bar);
    this.hpFill = el('div', 'fill', hp);
    const hpCap = el('span', 'meter-cap', hp);
    pixelIcon(hpCap, 'heart', 'meter-icon');
    el('span', '', hpCap, 'HP');
    const xp = el('div', 'meter xp', this.bar);
    this.xpFill = el('div', 'fill', xp);
    const xpCap = el('span', 'meter-cap', xp);
    pixelIcon(xpCap, 'xp', 'meter-icon');
    el('span', '', xpCap, 'XP');
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
    rerolls: number,
    notesCollected: number,
  ): void {
    const itemPart = [...items].map(([id, level]) => `${id}:${level}`).join('|');
    const evolvedPart = [...evolved].join('|');
    const key = `${itemPart}/${evolvedPart}/${rerolls}/${notesCollected}`;
    if (key === this.runInfoKey) return;
    this.runInfoKey = key;
    this.rerollButton.textContent = `REROLL ×${rerolls}`;
    this.rerollButton.disabled = rerolls <= 0;
    this.noteEl.textContent = String(notesCollected);
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
      pixelIcon(socket, id, 'item-glyph');
      el('span', 'item-name', socket, item.shortName);
      el('span', 'item-tier', socket, String(level));
      const itemSummary = `${item.name} ${level}: ${item.levelLines[level - 1]}. ${item.description}`;
      socket.title = itemSummary;
      socket.setAttribute('aria-label', itemSummary);
    }
  }

  /** Plain-language passive details for the pause screen. The compact live
   * rack cannot carry readable copy on phones, so pausing is the reliable
   * in-run reference for both the current total and the item's core purpose. */
  renderItemDetails(items: ReadonlyMap<ItemId, number>, into: HTMLElement): void {
    into.replaceChildren();
    const head = el('div', 'pause-items-head', into);
    const countCopy = items.size > 6 ? `${items.size} ACTIVE · RUN CAP 6` : `${items.size}/6`;
    el('strong', '', head, `PASSIVE ITEMS · ${countCopy}`);
    el('span', '', head, 'CURRENT TOTALS');
    if (items.size === 0) {
      el('p', 'pause-items-empty', into, 'No passive items yet. Walk into an item reward pedestal to take one.');
      return;
    }
    const grid = el('div', 'pause-items-grid', into);
    for (const [id, level] of items) {
      const item = ITEMS[id];
      const row = el('div', 'pause-item', grid);
      row.style.setProperty('--item-color', `#${item.color.toString(16).padStart(6, '0')}`);
      pixelIcon(row, id, 'pause-item-glyph');
      const copy = el('div', 'pause-item-copy', row);
      el('strong', '', copy, `${item.name} · LV ${level}`);
      el('span', '', copy, item.levelLines[level - 1]);
      row.setAttribute('aria-label', `${item.name}, level ${level}: ${item.levelLines[level - 1]}`);
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

  /** Start screen. Every round begins with a physical three-weapon choice. */
  showStart(
    onStart: () => void,
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
    art.src = '/art/pixel/title-banner.png';
    art.alt = 'A moonlit pixel-art crypt with the hero, monsters, braziers, and ancient stonework';
    hero.appendChild(art);
    const title = el('div', 'title-lockup', hero);
    el('span', 'eyebrow', title, 'THE NEON CRYPT');
    el('h1', '', title, 'LOOP SURVIVORS');
    el('p', 'sub', title, 'Choose your first weapon. Build the track. Survive the endless crypt.');

    if (meta) {
      const profile = el('div', 'career-panel', s);
      const collectionProgress = meta.collection();
      const head = el('div', 'career-head', profile);
      el('strong', 'career-rank', head, 'AFTERHOURS COLLECTION');
      const careerRep = el('span', 'career-rep', head);
      pixelIcon(careerRep, 'note', 'hud-status-icon');
      el('span', '', careerRep, `${meta.state.notes} MUSIC NOTES`);
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
        'Collected notes bank when the round ends. Shop purchases unlock new weapons, passives, and perks.');

      const collection = el('div', 'collection-strip', profile);
      el('span', '', collection, `${meta.state.unlockedWeapons.length}/9 WEAPONS`);
      el('span', '', collection, `${meta.state.unlockedItems.length}/${ITEM_IDS.length} PASSIVES`);
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
          const button = el('button', `loadout-chip ${meta.state.startItem === id ? 'selected' : ''}`, choices) as HTMLButtonElement;
          pixelIcon(button, id, 'loadout-icon');
          el('span', '', button, item.name);
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
      const wallet = el('span', 'shop-wallet', shopHeadActions);
      pixelIcon(wallet, 'note', 'hud-status-icon');
      el('span', '', wallet, String(meta.state.notes));
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
        const cost = el('span', 'shop-cost', cardTop);
        if (status.purchased) {
          cost.textContent = 'OWNED';
        } else {
          pixelIcon(cost, 'note', 'shop-note-icon');
          el('span', '', cost, String(offer.cost));
        }
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

    const startBtn = el('button', 'start-btn', s, 'ENTER THE NEON CRYPT');
    startBtn.onclick = () => {
      this.closeScreen();
      onStart();
    };
    el('p', 'start-hint', s,
      'WASD / arrow keys / touch to move · choose one of three opening weapons · collect crystal XP and gold music notes · walk onto reward pedestals · R rerolls');
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
        ? 'FULL COLLECTION'
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

/** Crop a frame from the committed 512px UI atlas at an exact 4:1 ratio. */
function pixelIcon(parent: HTMLElement, id: HudPixelIcon, className = ''): HTMLElement {
  const index = HUD_PIXEL_ICON_INDEX[id];
  const column = index % 5;
  const row = Math.floor(index / 5);
  const node = el('span', `pixel-ui-icon ${className}`.trim(), parent);
  node.style.setProperty('--pixel-icon-x', `${-(8 + column * 100) / 4}px`);
  node.style.setProperty('--pixel-icon-y', `${-(8 + row * 100) / 4}px`);
  node.setAttribute('aria-hidden', 'true');
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
