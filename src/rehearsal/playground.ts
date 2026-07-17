// The chart playground (developer tools): one row per sound in a
// kit, one column per grid step across the full 4-bar phrase, a playhead
// sweeping in time, cells lighting as they fire. Charts of all voices stack
// vertically — the whole arrangement at a glance.
//
// In the rehearsal room it is fully editable and the loop keeps playing
// while editing, so every change is heard instantly: this is where tier
// charts are sculpted by ear. Mounted read-only it becomes the in-game
// debug overlay.

import { MusicEngine } from '../audio/engine';
import type { Chart, ChartEvent } from '../audio/charts';
import { getChart, isEdited, resetChart, saveChart } from '../audio/chartstore';
import { type Role, type Kit } from '../audio/kits';
import { STEPS_PER_BAR, STEPS_PER_PHRASE } from '../audio/scale';
import { supportedRoles } from '../audio/soundset';

export interface PlaygroundOptions {
  editable: boolean;
  /** Called when the mix toggle in a section header is clicked. The host
   *  owns voice state so its own UI stays in sync. */
  onToggleVoice?: (role: Role) => void;
}

export interface Playground {
  /** Re-read engine state (enabled voices, tiers) and redraw. */
  refresh(): void;
}

/** A row is one sound: a sample variant for unpitched kits, a note for
 *  pitched ones (several notes played on the same sample). */
interface RowDef {
  key: string;
  label: string;
  variant?: string;
  note?: number;
}

// Note rows offered per pitched kit, top row highest. Labels are semitone
// offsets from the root: 0 is home base, positive is higher/brighter,
// negative lower/darker. No theory needed: rows are just pitches to try,
// all guaranteed to fit the run's note set.
const NOTE_ROWS: Partial<Record<Role, number[]>> = {
  bass: [3, 0, -2, -5, -7],
  chord: [7, 5, 0],
  lead: [15, 12, 10, 7, 5, 3, 0, -2],
};

const VELOCITY_STEPS = [1.0, 0.7, 0.4];

const noteLabel = (n: number) => (n === 0 ? '0·root' : n > 0 ? `+${n}` : `−${-n}`);

function rowsFor(kit: Kit, chart: Chart): RowDef[] {
  if (!kit.pitched) {
    return [...kit.samples.keys()].map((v) => ({ key: `v${v}`, label: v, variant: v }));
  }
  // Union the preset rows with any note the chart already uses, so no
  // event is ever invisible or uneditable.
  const notes = new Set(NOTE_ROWS[kit.role] ?? [0]);
  for (const ev of chart.events) notes.add(ev.note ?? 0);
  return [...notes].sort((a, b) => b - a).map((n) => ({ key: `n${n}`, label: noteLabel(n), note: n }));
}

function eventMatchesRow(ev: ChartEvent, row: RowDef, kit: Kit): boolean {
  if (row.variant !== undefined) return (ev.variant ?? kit.defaultVariant) === row.variant;
  return (ev.note ?? 0) === row.note;
}

export function mountPlayground(
  root: HTMLElement,
  engine: MusicEngine,
  opts: PlaygroundOptions,
): Playground {
  root.classList.add('playground');

  interface Section {
    role: Role;
    body: HTMLElement;
    tierBtns: HTMLButtonElement[];
    barBtns: HTMLButtonElement[];
    mixBtn: HTMLButtonElement | null;
    editedMark: HTMLElement;
    resetBtn: HTMLButtonElement | null;
    playhead: HTMLElement;
    /** phrase step -> cells in that column, for playhead + fire flashes */
    cellsByStep: Map<number, HTMLElement[]>;
    /** `${row.key}|${phraseStep}` -> cell, for fire flashes */
    cellsByRowStep: Map<string, HTMLElement>;
    /** The tier being displayed (and heard: display follows the voice). */
    tier: number;
  }
  const sections = new Map<Role, Section>();

  const el = (tag: string, className: string, parent: HTMLElement, text = ''): HTMLElement => {
    const node = document.createElement(tag);
    node.className = className;
    if (text) node.textContent = text;
    parent.appendChild(node);
    return node;
  };

  // Only the instruments the game actually voices; the dormant catalog roles
  // the soundset builds no weapon around are not shown (see supportedRoles).
  for (const role of supportedRoles()) {
    const voice = engine.voices.get(role)!;
    const sec = el('div', 'pg-section', root);
    sec.style.setProperty('--voice-color', voice.kit.color);

    const head = el('div', 'pg-head', sec);
    let mixBtn: HTMLButtonElement | null = null;
    if (opts.onToggleVoice) {
      mixBtn = el('button', 'pg-mix', head, '●') as HTMLButtonElement;
      mixBtn.title = 'toggle this voice in the mix';
      mixBtn.onclick = () => opts.onToggleVoice!(role);
    } else {
      el('span', 'pg-mix pg-mix-static', head, '●');
    }
    el('span', 'pg-name', head, voice.kit.name);

    const tierWrap = el('span', 'pg-tiers', head);
    const tierBtns: HTMLButtonElement[] = [];
    ['I', 'II', 'III', 'IV'].forEach((numeral, i) => {
      const b = el('button', 'pg-tier', tierWrap, numeral) as HTMLButtonElement;
      b.title = `tier ${i + 1}`;
      b.onclick = () => {
        engine.setVoiceTier(role, i + 1);
        renderSection(role);
      };
      tierBtns.push(b);
    });

    const editedMark = el('span', 'pg-edited', head, 'edited');
    let resetBtn: HTMLButtonElement | null = null;
    const barBtns: HTMLButtonElement[] = [];
    if (opts.editable) {
      const barsWrap = el('span', 'pg-bars', head, 'bars');
      for (const n of [1, 2, 4]) {
        const b = el('button', 'pg-bar-n', barsWrap, String(n)) as HTMLButtonElement;
        b.title = `loop length: ${n} bar${n > 1 ? 's' : ''} (repeats inside the phrase)`;
        b.onclick = () => {
          const sct = sections.get(role)!;
          const chart = getChart(role, sct.tier);
          if (chart.bars === n) return;
          chart.bars = n;
          chart.events = chart.events.filter((ev) => ev.step < n * STEPS_PER_BAR);
          saveChart(role, sct.tier);
          renderSection(role, true);
        };
        barBtns.push(b);
      }

      // Per-voice volume: live mix control while sculpting, to the right of the
      // bars control. Editable mount only (the read-only in-game overlay is not
      // a mixing surface).
      const volWrap = el('label', 'pg-vol', head, 'vol');
      const vol = el('input', '', volWrap) as HTMLInputElement;
      vol.type = 'range';
      vol.min = '0';
      vol.max = '100';
      vol.value = '100';
      vol.title = 'this voice’s volume in the mix';
      vol.oninput = () => engine.setVoiceGain(role, Number(vol.value) / 100);

      resetBtn = el('button', 'pg-reset', head, 'reset chart') as HTMLButtonElement;
      resetBtn.title = 'discard edits, restore the shipped chart';
      resetBtn.onclick = () => {
        const sct = sections.get(role)!;
        resetChart(role, sct.tier);
        renderSection(role, true);
      };
    }

    const body = el('div', 'pg-body', sec);
    const playhead = el('div', 'pg-playhead', body);

    sections.set(role, {
      role,
      body,
      tierBtns,
      barBtns,
      mixBtn,
      editedMark,
      resetBtn,
      playhead,
      cellsByStep: new Map(),
      cellsByRowStep: new Map(),
      tier: voice.tier,
    });
    renderSection(role);
  }

  function cycleCell(role: Role, row: RowDef, step: number): void {
    const sct = sections.get(role)!;
    const voice = engine.voices.get(role)!;
    const chart = getChart(role, sct.tier);
    const idx = chart.events.findIndex(
      (ev) => ev.step === step && eventMatchesRow(ev, row, voice.kit),
    );
    if (idx === -1) {
      const ev: ChartEvent = { step, velocity: VELOCITY_STEPS[0] };
      if (row.variant !== undefined) ev.variant = row.variant;
      if (row.note !== undefined) {
        ev.note = row.note;
        if (voice.kit.samples.size > 1) ev.variant = voice.kit.defaultVariant;
      }
      chart.events.push(ev);
      chart.events.sort((a, b) => a.step - b.step);
    } else {
      const ev = chart.events[idx];
      const level = VELOCITY_STEPS.findIndex((v) => Math.abs(ev.velocity - v) < 0.13);
      if (level === -1 || level === VELOCITY_STEPS.length - 1) {
        chart.events.splice(idx, 1); // past the quietest level: remove the hit
      } else {
        ev.velocity = VELOCITY_STEPS[level + 1];
      }
    }
    saveChart(role, sct.tier);
    renderSection(role, true);
  }

  /** Right-click on a placed pitched hit cycles its sample variant (e.g.
   *  bass -> fat). Unpitched kits put variants on rows instead. */
  function cycleVariant(role: Role, row: RowDef, step: number): void {
    const sct = sections.get(role)!;
    const voice = engine.voices.get(role)!;
    if (!voice.kit.pitched || voice.kit.samples.size < 2) return;
    const chart = getChart(role, sct.tier);
    const ev = chart.events.find((e) => e.step === step && eventMatchesRow(e, row, voice.kit));
    if (!ev) return;
    const variants = [...voice.kit.samples.keys()];
    const current = variants.indexOf(ev.variant ?? voice.kit.defaultVariant);
    ev.variant = variants[(current + 1) % variants.length];
    saveChart(role, sct.tier);
    renderSection(role, true);
  }

  function renderSection(role: Role, force = false): void {
    const sct = sections.get(role)!;
    const voice = engine.voices.get(role)!;
    const tierChanged = sct.tier !== voice.tier;
    sct.tier = voice.tier;
    const chart = getChart(role, sct.tier);
    const chartSteps = chart.bars * STEPS_PER_BAR;
    const rows = rowsFor(voice.kit, chart);

    sct.tierBtns.forEach((b, i) => b.classList.toggle('current', i + 1 === sct.tier));
    sct.barBtns.forEach((b) => b.classList.toggle('current', Number(b.textContent) === chart.bars));
    const edited = isEdited(role, sct.tier);
    sct.editedMark.classList.toggle('visible', edited);
    sct.resetBtn?.classList.toggle('hidden', !edited);
    sct.body.parentElement!.classList.toggle('active', voice.enabled);
    sct.mixBtn?.classList.toggle('on', voice.enabled);

    // The grid itself only rebuilds when its content can have changed;
    // refresh() sweeps all sections on every scrub tick, so the cheap
    // header-state path above must stay the common case.
    if (!force && !tierChanged && sct.cellsByStep.size > 0) return;

    sct.body.querySelectorAll('.pg-row').forEach((n) => n.remove());
    sct.cellsByStep.clear();
    sct.cellsByRowStep.clear();

    for (const row of rows) {
      const rowEl = el('div', 'pg-row', sct.body);
      el('span', 'pg-row-label', rowEl, row.label);
      const cells = el('div', 'pg-cells', rowEl);
      for (let step = 0; step < STEPS_PER_PHRASE; step++) {
        const ghost = step >= chartSteps;
        const srcStep = step % chartSteps;
        const cell = el('button', 'pg-cell', cells) as HTMLButtonElement;
        if (step % STEPS_PER_BAR === 0) cell.classList.add('bar-start');
        else if (step % 4 === 0) cell.classList.add('beat-start');
        const ev = chart.events.find(
          (e) => e.step === srcStep && eventMatchesRow(e, row, voice.kit),
        );
        if (ev) {
          cell.classList.add('hit');
          cell.style.setProperty('--vel', String(ev.velocity));
          if (
            voice.kit.pitched &&
            voice.kit.samples.size > 1 &&
            (ev.variant ?? voice.kit.defaultVariant) !== voice.kit.defaultVariant
          ) {
            cell.textContent = ev.variant![0]; // e.g. bass "f" for fat
          }
        }
        if (ghost) {
          cell.classList.add('ghost');
          cell.title = 'repeat of the loop (edit the first pass)';
          cell.disabled = true;
        } else if (opts.editable) {
          cell.title = ev
            ? `velocity ${ev.velocity.toFixed(1)} — click to soften, right-click to change sound`
            : 'click to place a hit';
          cell.onclick = () => cycleCell(role, row, step);
          cell.oncontextmenu = (e) => {
            e.preventDefault();
            cycleVariant(role, row, step);
          };
        } else {
          cell.disabled = true;
        }
        let col = sct.cellsByStep.get(step);
        if (!col) sct.cellsByStep.set(step, (col = []));
        col.push(cell);
        sct.cellsByRowStep.set(`${row.key}|${step}`, cell);
      }
    }
  }

  // ---- cells light as they fire ----
  engine.addTriggerListener((t) => {
    if (t.step < 0) return; // previews are not on the grid
    const sct = sections.get(t.role);
    if (!sct) return;
    const voice = engine.voices.get(t.role)!;
    const rowKey = voice.kit.pitched ? `n${t.note ?? 0}` : `v${t.variant ?? voice.kit.defaultVariant}`;
    const cell = sct.cellsByRowStep.get(`${rowKey}|${t.step}`);
    if (!cell) return;
    cell.classList.remove('firing');
    void cell.offsetWidth; // restart the CSS animation
    cell.classList.add('firing');
  });

  // ---- the playhead sweeps the phrase ----
  let raf = 0;
  function frame(): void {
    const running = engine.clock.running;
    const phraseStep = running ? engine.currentStep() % STEPS_PER_PHRASE : -1;
    for (const sct of sections.values()) {
      sct.playhead.classList.toggle('hidden', !running);
      if (running) sct.playhead.style.setProperty('--step', String(phraseStep));
    }
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  // Stop animating if the playground's DOM is torn out (mode switch).
  const observer = new MutationObserver(() => {
    if (!root.isConnected) {
      cancelAnimationFrame(raf);
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  return {
    refresh(): void {
      for (const role of sections.keys()) renderSection(role);
    },
  };
}
