// The Mixer panel (branch mixer-system): the allocation surface. Eight channel
// strips (one per hired instrument, rack order); each shows complexity (which
// pattern plays) and power (how hard each note hits) as pip rows with +/-
// controls, a mute, and the instrument's freshness state. The player edits a
// DRAFT against the granted point totals; closing the panel commits the draft,
// which the game applies at the next bar (the musical entry rule).
//
// Validation is live: the panel never lets an illegal draft exist — caps,
// pool balance, and the silence rule (at least one instrument playing) are
// enforced by disabling the offending button, with the reason as its tooltip.

import type { Kit, Role } from '../audio/kits';
import { SLOT_LABEL, SLOTS, slotOf } from './band';
import {
  C_MAX,
  FRESH_PHRASES,
  HOT_C,
  isStale,
  P_MAX,
  REST_PHRASES,
  type Allocation,
  type FreshState,
} from './mixer';

/** What the panel reads off the world when it opens. */
export interface MixerWorld {
  arsenal: readonly Role[];
  complexity: ReadonlyMap<Role, number>;
  power: ReadonlyMap<Role, number>;
  fresh: ReadonlyMap<Role, FreshState>;
  totalC: number;
  totalP: number;
}

export interface MixerPanel {
  destroy(): void;
  /** Commit the draft and close — what the ✓ done button does (the game's
   *  Tab toggle routes here so open/close are symmetric). */
  done(): void;
}

export function mountMixerPanel(
  root: HTMLElement,
  world: MixerWorld,
  kits: Map<Role, Kit>,
  onDone: (alloc: Allocation) => void,
): MixerPanel {
  // The draft: a full desired distribution, seeded from the live world.
  const draft: Allocation = new Map();
  for (const role of world.arsenal) {
    draft.set(role, {
      c: world.complexity.get(role) ?? 0,
      p: world.power.get(role) ?? 0,
    });
  }

  const el = (tag: string, className: string, parent: HTMLElement, text = ''): HTMLElement => {
    const node = document.createElement(tag);
    node.className = className;
    if (text) node.textContent = text;
    parent.appendChild(node);
    return node;
  };

  const overlay = el('div', 'mixer-overlay', root);
  const panel = el('div', 'mixer-panel', overlay);
  const head = el('div', 'mx-head', panel);
  el('span', 'mx-title', head, 'the mixer');
  const poolsEl = el('span', 'mx-pools', head);
  const doneBtn = el('button', 'mx-done', head, '✓ done') as HTMLButtonElement;
  const strips = el('div', 'mx-strips', panel);
  el(
    'p',
    'mx-hint',
    panel,
    'complexity ◆ = how busy the pattern is · power ■ = how hard each note hits · changes land on the next bar',
  );

  const poolC = (): number => {
    let sum = 0;
    for (const a of draft.values()) sum += a.c;
    return world.totalC - sum;
  };
  const poolP = (): number => {
    let sum = 0;
    for (const a of draft.values()) sum += a.p;
    return world.totalP - sum;
  };
  const playingCount = (): number => {
    let n = 0;
    for (const a of draft.values()) if (a.c >= 1) n++;
    return n;
  };

  // Arsenal in rack (slot) order, so the panel mirrors the band rack.
  const ordered = [...world.arsenal].sort(
    (a, b) => SLOTS.indexOf(slotOf(a)) - SLOTS.indexOf(slotOf(b)),
  );

  interface StripRefs {
    role: Role;
    cPips: HTMLElement;
    pPips: HTMLElement;
    cMinus: HTMLButtonElement;
    cPlus: HTMLButtonElement;
    pMinus: HTMLButtonElement;
    pPlus: HTMLButtonElement;
    muteBtn: HTMLButtonElement;
    stateChip: HTMLElement;
    strip: HTMLElement;
  }
  const refs: StripRefs[] = [];

  for (const role of ordered) {
    const kit = kits.get(role)!;
    const strip = el('div', 'mx-strip', strips);
    strip.style.setProperty('--voice-color', kit.color);
    const nameRow = el('div', 'mx-name-row', strip);
    el('span', 'mx-name', nameRow, kit.name);
    el('span', 'mx-slot', nameRow, SLOT_LABEL[slotOf(role)]);
    const stateChip = el('span', 'mx-state', nameRow);

    const cRow = el('div', 'mx-row', strip);
    el('span', 'mx-row-label', cRow, 'complexity');
    const cPips = el('span', 'mx-pips pips-c', cRow);
    const cMinus = el('button', 'small mx-btn', cRow, '−') as HTMLButtonElement;
    const cPlus = el('button', 'small mx-btn', cRow, '+') as HTMLButtonElement;

    const pRow = el('div', 'mx-row', strip);
    el('span', 'mx-row-label', pRow, 'power');
    const pPips = el('span', 'mx-pips pips-p', pRow);
    const pMinus = el('button', 'small mx-btn', pRow, '−') as HTMLButtonElement;
    const pPlus = el('button', 'small mx-btn', pRow, '+') as HTMLButtonElement;

    const muteBtn = el('button', 'small mx-mute', strip, 'mute') as HTMLButtonElement;

    const a = (): { c: number; p: number } => draft.get(role)!;
    cPlus.onclick = () => {
      if (a().c >= 1 && a().c < C_MAX && poolC() > 0) a().c++;
      paint();
    };
    cMinus.onclick = () => {
      if (a().c > 1) a().c--;
      paint();
    };
    pPlus.onclick = () => {
      if (a().c >= 1 && a().p < P_MAX && poolP() > 0) a().p++;
      paint();
    };
    pMinus.onclick = () => {
      if (a().p > 1) a().p--;
      paint();
    };
    muteBtn.onclick = () => {
      if (a().c === 0) {
        // unmute: costs the minimum 1 complexity + 1 power back
        if (poolC() >= 1 && poolP() >= 1) {
          a().c = 1;
          a().p = 1;
        }
      } else if (playingCount() > 1) {
        a().c = 0;
        a().p = 0;
      }
      paint();
    };

    refs.push({ role, cPips, pPips, cMinus, cPlus, pMinus, pPlus, muteBtn, stateChip, strip });
  }

  function pips(container: HTMLElement, n: number, max: number): void {
    container.replaceChildren();
    for (let i = 1; i <= max; i++) {
      const pip = document.createElement('span');
      pip.className = `pip ${i <= n ? 'on' : ''}`;
      container.appendChild(pip);
    }
  }

  function stateText(role: Role, c: number): { text: string; cls: string } {
    const f = world.fresh.get(role);
    if (!f) return { text: '', cls: '' };
    const liveC = world.complexity.get(role) ?? 0;
    if (f.primed) {
      return c >= HOT_C && liveC < HOT_C
        ? { text: '★ drop ready', cls: 'primed' }
        : { text: '★ primed', cls: 'primed' };
    }
    if (liveC >= HOT_C) {
      if (f.primedLeft > 0) return { text: `drop! ${f.primedLeft} left`, cls: 'dropping' };
      if (isStale(f)) return { text: 'stale — rest it', cls: 'stale' };
      return { text: `hot ${f.hotPhrases}/${FRESH_PHRASES}`, cls: 'hot' };
    }
    if (liveC >= 1 && f.restPhrases > 0) {
      return { text: `resting ${f.restPhrases}/${REST_PHRASES}`, cls: 'rest' };
    }
    return { text: '', cls: '' };
  }

  function paint(): void {
    poolsEl.textContent = `unspent  ◆ ${poolC()}  ■ ${poolP()}`;
    for (const r of refs) {
      const a = draft.get(r.role)!;
      pips(r.cPips, a.c, C_MAX);
      pips(r.pPips, a.p, P_MAX);
      r.strip.classList.toggle('muted', a.c === 0);
      const canPlusC = a.c >= 1 && a.c < C_MAX && poolC() > 0;
      const canPlusP = a.c >= 1 && a.p < P_MAX && poolP() > 0;
      r.cPlus.disabled = !canPlusC;
      r.cPlus.title = a.c === 0 ? 'muted' : a.c >= C_MAX ? 'at max' : poolC() <= 0 ? 'no unspent complexity' : '';
      r.cMinus.disabled = a.c <= 1;
      r.cMinus.title = a.c === 1 ? 'use mute to silence it' : '';
      r.pPlus.disabled = !canPlusP;
      r.pPlus.title = a.c === 0 ? 'muted' : a.p >= P_MAX ? 'at max' : poolP() <= 0 ? 'no unspent power' : '';
      r.pMinus.disabled = a.p <= 1;
      if (a.c === 0) {
        r.muteBtn.textContent = 'unmute';
        const can = poolC() >= 1 && poolP() >= 1;
        r.muteBtn.disabled = !can;
        r.muteBtn.title = can ? 'costs ◆1 ■1' : 'needs ◆1 ■1 unspent';
      } else {
        r.muteBtn.textContent = 'mute';
        const last = playingCount() <= 1;
        r.muteBtn.disabled = last;
        r.muteBtn.title = last ? "the track can't go silent" : 'returns its points';
      }
      const st = stateText(r.role, a.c);
      r.stateChip.textContent = st.text;
      r.stateChip.className = `mx-state ${st.cls}`;
    }
  }

  paint();

  const finish = (): void => {
    onDone(draft);
  };
  doneBtn.onclick = finish;

  return {
    destroy(): void {
      overlay.remove();
    },
    done: finish,
  };
}
