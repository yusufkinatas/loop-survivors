// All game UI is plain DOM overlaid on the canvas, cheap enough to throw
// away and rebuild later. Start screen, HUD, end screens, and
// the hit flash. Level-up picks are now dropped in-world (see game.ts /
// view.ts), not a DOM screen.

import { type Kit, type Role } from '../audio/kits';
import { BUILD } from './config';
import type { BuildMods } from './build';

import { WEAPON_MAX_LEVEL } from './weapons/levels';
/** Tier numerals used by the band rack. One per weapon level. */
export const TIER_NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];

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
    this.noteEl = el('span', 'hud-notes', top, '♫ 0');
    const hp = el('div', 'meter hp', this.bar);
    this.hpFill = el('div', 'fill', hp);
    el('span', 'meter-cap', hp, 'HP');
    const xp = el('div', 'meter xp', this.bar);
    this.xpFill = el('div', 'fill', xp);
    this.bar.style.display = 'none';

    this.flash = el('div', 'hit-flash', root);
    this.pulse = el('div', 'level-pulse', root);
    this.toastStack = el('div', 'toast-stack', root);
    // The band rack: one numbered socket per weapon slot, empty until hired.
    this.rack = el('div', 'band-rack', root);
    this.rack.style.display = 'none';
  }

  showHud(show: boolean): void {
    this.bar.style.display = show ? '' : 'none';
    this.rack.style.display = show ? '' : 'none';
  }

  /** The passive rack that used to live here went with the passives (#265).
   *  What is left is the note counter — a run stat now, banked nowhere. */
  setRunInfo(evolved: ReadonlySet<Role>, notesCollected: number): void {
    const key = `${[...evolved].join('|')}/${notesCollected}`;
    if (key === this.runInfoKey) return;
    this.runInfoKey = key;
    this.noteEl.textContent = `♫ ${notesCollected}`;
  }

  /** Everything the build currently adds up to, as one flat list — the pause
   * screen's answer to "what am I actually playing right now?". Items and
   * weapons each show a level a few lines up; this is the total they make
   * together. A stat sitting at its baseline reads as a dash rather than
   * "+0%", so the ones you have invested in are the ones that catch the eye. */
  renderStats(stats: BuildStats, into: HTMLElement): void {
    into.replaceChildren();
    const head = el('div', 'pause-items-head', into);
    el('strong', '', head, 'STATS');
    el('span', '', head, 'CURRENT TOTALS');
    const grid = el('div', 'pause-stats-grid', into);
    for (const group of statGroups(stats)) {
      const column = el('div', 'pause-stats-group', grid);
      for (const row of group) {
        const line = el('div', `pause-stat ${row.value === NEUTRAL ? 'neutral' : ''}`, column);
        el('span', 'pause-stat-glyph', line, row.glyph);
        el('span', 'pause-stat-name', line, row.name);
        el('span', 'pause-stat-value', line, row.value);
        line.setAttribute('aria-label', `${row.name}: ${row.value === NEUTRAL ? 'none' : row.value}`);
      }
    }
  }

  /** The band rack: BUILD.weaponCap numbered sockets, empty ones asking to be
   *  filled, filled ones showing the hired instrument (its color + name).
   *  Sockets are numbered by acquisition order — the number a socket carries is
   *  the number key that toggles it — so the rack reads in the order the player
   *  built it, and an already-placed weapon never renumbers. Rebuilt on every
   *  pick (cheap: 5 sockets). Renders into the HUD rack by default, or any
   *  supplied container so the pause menu can show the same band. The dev
   *  number-key toggles mark a deactivated owner's socket dimmed, and a socket
   *  with a change scheduled for the next bar pulses (up from dim toward on, or
   *  down from full toward off).
   *
   *  Tier pips are opt-in (`showTiers`) and only the pause screen asks for
   *  them: the live rack says who is on stage, the pause screen says how far
   *  each of them has come. */
  renderBand(
    tiers: ReadonlyMap<Role, number>,
    opts: {
      into?: HTMLElement;
      deactivated?: ReadonlySet<Role>;
      pending?: ReadonlySet<Role>;
      evolved?: ReadonlySet<Role>;
      showTiers?: boolean;
    } = {},
  ): void {
    const { deactivated, pending, evolved, showTiers = false } = opts;
    const into = opts.into ?? this.rack;
    into.replaceChildren();
    const owned = [...tiers.keys()];
    // A run can never exceed the cap, so this is always exactly weaponCap
    // sockets there. The sandbox bypasses the cap on purpose (FULL BAND VIII
    // loads the whole catalog); growing rather than truncating keeps the rack
    // from hiding weapons that are audibly playing.
    const socketCount = Math.max(BUILD.weaponCap, owned.length);
    for (let slot = 0; slot < socketCount; slot++) {
      const owner = owned[slot];
      let cls = owner ? 'filled' : 'empty';
      if (owner) {
        const off = deactivated?.has(owner) ?? false;
        const pend = pending?.has(owner) ?? false;
        // Pending pulses from the CURRENT settled state toward its opposite;
        // a settled-off socket with no pending change just sits dimmed.
        if (pend) cls += off ? ' pending-on' : ' pending-off';
        else if (off) cls += ' deactivated';
        if (evolved?.has(owner)) cls += ' evolved';
      }
      const socket = el('div', `band-socket ${cls}`, into);
      el('span', 'socket-slot', socket, String(slot + 1));
      if (owner) {
        const kit = this.kits.get(owner)!;
        socket.style.setProperty('--voice-color', kit.color);
        el('span', 'socket-name', socket, kit.name);
        const tier = tiers.get(owner) ?? 1;
        if (showTiers) {
          const pips = el('span', 'socket-pips', socket);
          for (let i = 1; i <= WEAPON_MAX_LEVEL; i++) {
            el('span', `pip ${i <= tier ? 'on' : ''}`, pips);
          }
          el('span', 'socket-tier', socket, `LV ${tier}`);
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

  /** Start screen: the run picks its own opening instrument — three weapon
   *  pedestals drop in-world the moment it starts, so nothing is chosen here.
   *  Runs start manual; auto-move is an in-game toggle (B hotkey). */
  showStart(
    onStart: () => void,
    onSandbox: () => void,
    /** A prototype's own controls, painted under the title. #256 requires every
     *  layer of every round-1 stack to be individually switchable so each gets its
     *  own verdict, and the start screen is where a tester flips them — the run
     *  shape and the build model are both decided at run start. */
    extra?: (into: HTMLElement) => void,
  ): void {
    const s = this.newScreen();
    s.classList.add('start-screen');
    const hero = el('div', 'start-hero', s);
    const title = el('div', 'title-lockup', hero);
    el('span', 'eyebrow', title, 'THE INFINITE NIGHT');
    el('h1', '', title, 'LOOP SURVIVORS');
    el('p', 'sub', title, 'Build the track. Draw the arena. Survive until the crowd wins.');

    // The career panel, the Afterhours Shop and the mastery recipe chips all
    // stood here. They went with the meta layer (#265): there is no wallet, no
    // power-up rank and no save, so the start screen is a title and a button.

    extra?.(el('div', 'start-proto', s));

    const startBtn = el('button', 'start-btn', s, 'ENTER THE SOUNDWOOD');
    startBtn.onclick = () => {
      this.closeScreen();
      onStart();
    };
    el('p', 'start-hint', s,
      'WASD / arrow keys / touch to move · collect blue XP and gold music notes · walk onto coral crosses to heal · rare Stage Magnets vacuum the whole map · walk onto reward pedestals');
    // Boss Fights gets its own menu item right under the primary CTA rather than
    // hiding inside the faint `experiments` disclosure — it's a headline mode,
    // so it earns real visibility. Still beta while it lives on a separate
    // playtest surface (#boss).
    const bossFightsBtn = el('button', 'boss-fights-btn', s, 'Boss Fights (beta)');
    bossFightsBtn.onclick = () => {
      location.hash = '#boss';
    };
    // Below the primary CTA, two menu buttons: sandbox launches directly,
    // experiments is a disclosure for the standalone playtest surfaces (full
    // tracks, rehearsal room — mirrors src/experiments/).
    const dev = el('div', 'start-dev', s);
    const menuRow = el('div', 'start-dev-row', dev);
    const sandboxBtn = el('button', 'small start-dev-toggle', menuRow, 'sandbox');
    const experimentsToggle = el('button', 'small start-dev-toggle', menuRow, 'experiments');

    const experimentsRow = el('div', 'start-dev-row', dev);
    experimentsRow.style.display = 'none';
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
    tracksBtn.onclick = () => {
      location.hash = '#tracklab';
    };
    roomBtn.onclick = () => {
      location.hash = '#rehearsal';
    };
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
    victory: boolean,
    stats: {
      timeS: number;
      kills: number;
      level: number;
      notesCollected: number;
      damageByRole: Partial<Record<Role, number>>;
      killsByRole: Partial<Record<Role, number>>;
    },
    onRetry: () => void,
  ): void {
    const s = this.newScreen();
    s.classList.add('end-screen');
    // One screen, two endings. Only the headline and the demo-end block differ;
    // the stats and ONE MORE SET are the same run report either way.
    if (victory) s.classList.add('win-screen');
    el('span', 'eyebrow', s, victory ? "THE HUSH COULDN'T STOP YOU" : 'THE CROWD FINALLY WON');
    el('h1', '', s, victory ? 'SET COMPLETE' : 'SET ENDED');
    el('p', 'sub run-summary', s,
      `${formatTime(stats.timeS)} · ${stats.kills} kills · level ${stats.level} · ♫ ${stats.notesCollected}`);

    if (victory) {
      // The demo has no minute 31: say so here, and give the player somewhere
      // to send what they thought of it.
      const demo = el('section', 'demo-end', s);
      el('span', 'eyebrow', demo, "THAT'S THE DEMO");
      const copy = el('p', 'demo-end-copy', demo,
        'Congratulations, you played the whole set. Thanks for playing, I appreciate any feedback! Reach the developer at ');
      const link = el('a', 'demo-end-link', copy, 'yusufkinatas.com') as HTMLAnchorElement;
      link.href = 'https://yusufkinatas.com';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    }

    // The settlement panel — notes banked, ranks owned, milestones — went with
    // the career layer (#265). A run now ends and reports itself, nothing more.
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

/** What the pause screen needs to print the stat list: the two totals that
 * live on the world (they fold a base value in) plus the raw modifier bag. */
export interface BuildStats {
  maxHp: number;
  armor: number;
  mods: BuildMods;
}

interface StatRow {
  glyph: string;
  name: string;
  value: string;
}

/** Shown instead of "+0%" for a stat nothing has touched yet. */
const NEUTRAL = '–';

/** A multiplier as the bonus a player recognises from the item copy: 1.24 →
 * "+24%". Rounded, because the item ladders are whole percents and a build
 * that reads "+23.999%" is a bug report waiting to happen. */
function bonusPct(mul: number): string {
  const pct = Math.round((mul - 1) * 100);
  return pct === 0 ? NEUTRAL : `${pct > 0 ? '+' : ''}${pct}%`;
}

function bonusCount(n: number): string {
  return n === 0 ? NEUTRAL : `+${n}`;
}

/** Grouped the way the build reads: what keeps you alive, what your weapons
 * hit with, and what everything else does. Glyphs match the passive items that
 * feed each line so the list and the item panel above it speak one language. */
function statGroups(stats: BuildStats): StatRow[][] {
  const m = stats.mods;
  return [
    [
      { glyph: '♥', name: 'Max Health', value: String(stats.maxHp) },
      {
        glyph: '✚',
        name: 'Recovery',
        value: m.hpRegenPerSecond === 0 ? NEUTRAL : `${m.hpRegenPerSecond.toFixed(1)}/s`,
      },
      { glyph: '▣', name: 'Armor', value: String(stats.armor) },
      { glyph: '↗', name: 'Move Speed', value: bonusPct(m.moveMul) },
    ],
    [
      { glyph: '▲', name: 'Might', value: bonusPct(m.damageMul) },
      { glyph: '»', name: 'Shot Speed', value: bonusPct(m.projectileSpeedMul) },
      { glyph: '∞', name: 'Duration', value: bonusPct(m.durationMul) },
      { glyph: '◉', name: 'Area', value: bonusPct(m.areaMul) },
      { glyph: '↦', name: 'Shove', value: bonusPct(m.knockbackMul) },
    ],
    [
      { glyph: '⧉', name: 'Amount', value: bonusCount(m.extraProjectiles) },
      { glyph: '◆', name: 'Pierce', value: bonusCount(m.extraPierce) },
      {
        glyph: '◇',
        name: 'Bounce',
        value:
          m.bounceCount === 0
            ? NEUTRAL
            : `${m.bounceCount} · ${Math.round(m.bounceRetention * 100)}%`,
      },
      { glyph: '✦', name: 'Magnet', value: bonusPct(m.magnetMul) },
    ],
  ];
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
