// THE CIRCUIT'S SCREEN. Three readouts, and every one of them is load-bearing
// rather than decorative.
//
// #270 names one of this stack's kill criteria as "upkeep is bookkeeping — if you
// are reading a meter instead of feeling a budget, it is a spreadsheet", and in
// the same breath notes that pillar 3's rewritten form (THE MUSIC IS THE REWARD,
// THE SCREEN IS THE INFORMATION) means the pool has to be a screen object rather
// than something inferred by ear. Those pull in opposite directions, and the way
// through is that NO NUMBER APPEARS HERE. Everything is a bar, a lit wedge or a
// word:
//
//  - THE POOL is a bar that visibly falls on every trigger and rises between
//    them, with a hairline where this bar's draw sits. You watch a level, never
//    read a quantity.
//  - THE BANK is a second, thinner bar under it that only fills while you are
//    running under budget, and lights up whole when a Blackout is buyable.
//  - THE WHEEL is three wedges — PUNCH, CUT, HOLD — lit if the band PLAYING
//    right now can answer that kind of body. It is drawn from the active band,
//    so muting a voice to afford the rest visibly opens a hole.
//  - THE ROOM CARD says where you are, what is on, and how much of the set is
//    left; on the street it says what the nearest door is asking for.

import { ATTACKS, type Attack, type Role } from '../audio/kits';
import { ATTACK_VERB } from './coverage';
import type { CircuitRun } from './run-state';
import { formatNightClock, venueAt, VENUES, type Venue } from './venues';
import { CIRCUIT } from './toggles';

function el(tag: string, className: string, parent: HTMLElement, text = ''): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  parent.appendChild(node);
  return node;
}

export interface CircuitHudState {
  circuit: CircuitRun;
  tiers: ReadonlyMap<Role, number>;
  playerX: number;
  playerY: number;
  timeS: number;
  nightLengthS: number;
  /** This bar's priced draw and what regeneration will cover, both as a
   *  fraction of the pool's depth — the hairline and the safe zone. */
  draw01: number;
  regen01: number;
}

export class CircuitHud {
  private readonly root: HTMLElement;
  private readonly poolFill: HTMLElement;
  private readonly poolDrawMark: HTMLElement;
  private readonly poolRegenMark: HTMLElement;
  private readonly bankRow: HTMLElement;
  private readonly bankFill: HTMLElement;
  private readonly wheel: HTMLElement;
  private readonly wedges = new Map<Attack, HTMLElement>();
  private readonly card: HTMLElement;
  private readonly cardWhere: HTMLElement;
  private readonly cardAct: HTMLElement;
  private readonly setFill: HTMLElement;
  private readonly clockEl: HTMLElement;
  private lastCardKey = '';

  constructor(parent: HTMLElement) {
    this.root = el('div', 'circuit-hud', parent);
    this.root.style.display = 'none';

    // The room card, first because it is where the eye goes on arrival.
    this.card = el('div', 'ci-card', this.root);
    const cardTop = el('div', 'ci-card-top', this.card);
    this.cardWhere = el('span', 'ci-where', cardTop, 'THE STREET');
    this.clockEl = el('span', 'ci-clock', cardTop, '21:00');
    this.cardAct = el('div', 'ci-act', this.card, '');
    const setMeter = el('div', 'ci-set', this.card);
    this.setFill = el('div', 'ci-set-fill', setMeter);

    // The pool, with its draw hairline and its regeneration shading.
    const pool = el('div', 'ci-pool', this.root);
    this.poolRegenMark = el('div', 'ci-pool-regen', pool);
    this.poolFill = el('div', 'ci-pool-fill', pool);
    this.poolDrawMark = el('div', 'ci-pool-draw', pool);
    el('span', 'ci-cap', pool, 'HEADROOM');

    this.bankRow = el('div', 'ci-bank', this.root);
    this.bankFill = el('div', 'ci-bank-fill', this.bankRow);
    el('span', 'ci-cap', this.bankRow, 'BANK');

    this.wheel = el('div', 'ci-wheel', this.root);
    for (const attack of ATTACKS) {
      const wedge = el('span', 'ci-wedge', this.wheel, ATTACK_VERB[attack]);
      this.wedges.set(attack, wedge);
    }
  }

  show(on: boolean): void {
    this.root.style.display = on ? '' : 'none';
    this.card.style.display = CIRCUIT.nightOut ? '' : 'none';
    this.root.classList.toggle('no-headroom', !CIRCUIT.headroom);
    this.root.classList.toggle('no-coverage', !CIRCUIT.coverage);
  }

  paint(state: CircuitHudState): void {
    const { circuit } = state;
    if (CIRCUIT.headroom) this.paintHeadroom(state);
    if (CIRCUIT.coverage) this.paintWheel(circuit, state.tiers);
    if (CIRCUIT.nightOut) this.paintCard(state);
  }

  private paintHeadroom(state: CircuitHudState): void {
    const { headroom } = state.circuit;
    this.poolFill.style.width = `${headroom.pool01 * 100}%`;
    // The hairline: where this bar's draw would leave the pool. Left of the
    // regeneration shading means the band is banking; right of it means the
    // pool is falling and a brownout is coming.
    this.poolDrawMark.style.left = `${Math.min(100, state.draw01 * 100)}%`;
    this.poolRegenMark.style.width = `${Math.min(100, state.regen01 * 100)}%`;
    this.poolFill.classList.toggle('spending', state.draw01 > state.regen01 + 1e-6);
    this.poolFill.classList.toggle('blackout', headroom.blackout);
    this.bankFill.style.width = `${headroom.bank01 * 100}%`;
    // Glows on AVAILABLE, not merely full: a bank that cannot buy anything must
    // not be shouting that it can.
    this.bankRow.classList.toggle('ready', state.circuit.blackoutAvailable());
    this.bankRow.classList.toggle('spent', headroom.blackout);
  }

  private paintWheel(circuit: CircuitRun, tiers: ReadonlyMap<Role, number>): void {
    const covered = circuit.covered(tiers);
    for (const attack of ATTACKS) {
      this.wedges.get(attack)!.classList.toggle('lit', covered.has(attack));
    }
  }

  private paintCard(state: CircuitHudState): void {
    const { circuit } = state;
    this.clockEl.textContent = formatNightClock(state.timeS, state.nightLengthS);
    const place = circuit.place;
    let where: string;
    let act: string;
    let progress = 0;
    if (place.venue && place.playing && place.set) {
      where = place.venue.name.toUpperCase();
      act = place.set.act;
      progress = circuit.setProgress01();
    } else if (place.venue && place.set) {
      where = place.venue.name.toUpperCase();
      act = 'DOOR SHUT';
    } else {
      where = 'THE STREET';
      const next = nearestUnplayed(circuit, state.playerX, state.playerY);
      act = next
        ? `WALKING TO ${next.name.toUpperCase()}`
        : 'NOWHERE LEFT TO PLAY';
    }
    const key = `${where}/${act}/${Math.round(progress * 40)}`;
    if (key !== this.lastCardKey) {
      this.lastCardKey = key;
      this.cardWhere.textContent = where;
      this.cardAct.textContent = act;
    }
    this.setFill.style.width = `${progress * 100}%`;
    this.card.classList.toggle('street', !place.playing);
  }

  destroy(): void {
    this.root.remove();
  }
}

/** The nearest room that has not been played yet, so the street card can point
 *  somewhere rather than just saying you are outside. Nearest by straight-line
 *  distance, which on this map is also the nearest by walking. */
function nearestUnplayed(circuit: CircuitRun, x: number, y: number): Venue | null {
  let best: Venue | null = null;
  let bestD = Infinity;
  const inside = venueAt(x, y);
  for (const venue of VENUES) {
    if (circuit.finished.has(venue.id) || venue === inside) continue;
    const d = (venue.x - x) ** 2 + (venue.y - y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = venue;
    }
  }
  return best;
}
