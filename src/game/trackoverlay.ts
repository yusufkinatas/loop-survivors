// The minimal "now playing" readout (dev surface, hotkey C): one slim row per
// active voice — color dot, name, tier pips, and a 16-step single-bar mini
// grid with a moving playhead. Built for the game; the rehearsal room keeps
// the full editable playground.

import { getChart } from '../audio/chartstore';
import type { MusicEngine } from '../audio/engine';
import type { Kit, Role } from '../audio/kits';
import { STEPS_PER_BAR, STEPS_PER_PHRASE } from '../audio/scale';
import { WEAPON_MAX_LEVEL, chartStageForLevel } from './weapons/levels';

interface Row {
  /** Phrase steps (0..63) on which this voice's chart fires. */
  hits: Set<number>;
  cells: HTMLElement[];
  lastBar: number;
  lastCol: number;
}

export interface TrackOverlay {
  /** Rebuild the rows from the current build (call on picks / instrument
   *  toggles). `deactivated` = settled off; `pending` = a change scheduled for
   *  the next bar (shown pulsing). */
  refresh(
    tiers: ReadonlyMap<Role, number>,
    deactivated: ReadonlySet<Role>,
    pending: ReadonlySet<Role>,
  ): void;
  /** Per-frame: move the playhead and repaint on bar changes. Cheap. */
  tick(): void;
}

export function mountTrackOverlay(
  root: HTMLElement,
  engine: MusicEngine,
  kits: Map<Role, Kit>,
): TrackOverlay {
  let rows: Row[] = [];

  function refresh(
    tiers: ReadonlyMap<Role, number>,
    deactivated: ReadonlySet<Role>,
    pending: ReadonlySet<Role>,
  ): void {
    root.replaceChildren();
    rows = [];
    // Acquisition order, matching the HUD rack and the number-key toggles.
    for (const role of tiers.keys()) {
      const kit = kits.get(role)!;
      const tier = tiers.get(role) ?? 1;
      const off = deactivated.has(role);
      const pend = pending.has(role);
      // Where the row is heading once any pending change lands.
      const willBeOff = off !== pend;

      const rowEl = document.createElement('div');
      const stateCls = pend ? (off ? ' pending-on' : ' pending-off') : off ? ' deactivated' : '';
      rowEl.className = `tr-row${stateCls}`;
      rowEl.style.setProperty('--voice-color', kit.color);

      const dot = document.createElement('span');
      dot.className = 'tr-dot';
      const name = document.createElement('span');
      name.className = 'tr-name';
      name.textContent = kit.name;
      const pips = document.createElement('span');
      pips.className = 'tr-pips';
      for (let i = 1; i <= WEAPON_MAX_LEVEL; i++) {
        const pip = document.createElement('span');
        pip.className = `pip${i <= tier ? ' on' : ''}`;
        pips.appendChild(pip);
      }
      const mark = document.createElement('span');
      mark.className = 'tr-mute';
      // Anticipates the pending target: the 'off' tag appears the moment a
      // deactivate is scheduled and clears the moment a reactivate is.
      mark.textContent = willBeOff ? 'off' : '';
      rowEl.append(dot, name, pips, mark);

      // Charts loop inside the 4-bar phrase, so precompute which phrase step
      // each event lands on; the per-bar repaint is then a set lookup.
      const chart = getChart(role, chartStageForLevel(tier));
      const chartSteps = chart.bars * STEPS_PER_BAR;
      const hits = new Set<number>();
      for (const ev of chart.events) {
        for (let s = ev.step; s < STEPS_PER_PHRASE; s += chartSteps) hits.add(s);
      }

      const cellsEl = document.createElement('span');
      cellsEl.className = 'tr-cells';
      const cells: HTMLElement[] = [];
      for (let i = 0; i < STEPS_PER_BAR; i++) {
        const cell = document.createElement('span');
        cell.className = `tr-cell${i % 4 === 0 ? ' b' : ''}`;
        cellsEl.appendChild(cell);
        cells.push(cell);
      }
      rowEl.appendChild(cellsEl);
      root.appendChild(rowEl);
      rows.push({ hits, cells, lastBar: -1, lastCol: -1 });
    }
  }

  function tick(): void {
    if (rows.length === 0) return;
    const phraseStep =
      ((engine.currentStep() % STEPS_PER_PHRASE) + STEPS_PER_PHRASE) % STEPS_PER_PHRASE;
    const bar = Math.floor(phraseStep / STEPS_PER_BAR);
    const col = phraseStep % STEPS_PER_BAR;
    for (const row of rows) {
      if (row.lastBar !== bar) {
        row.lastBar = bar;
        for (let i = 0; i < STEPS_PER_BAR; i++) {
          row.cells[i].classList.toggle('hit', row.hits.has(bar * STEPS_PER_BAR + i));
        }
      }
      if (row.lastCol !== col) {
        if (row.lastCol >= 0) row.cells[row.lastCol].classList.remove('ph');
        row.cells[col].classList.add('ph');
        row.lastCol = col;
      }
    }
  }

  return { refresh, tick };
}
