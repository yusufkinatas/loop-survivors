// THE STRIP: the one screen surface The Frontman adds (#271).
//
// #255 asked for the interlock to be "shown as a gap in the step strip you are
// invited to fill", and #253 rewrote pillar 3 to *the music is the reward, the
// screen is the information*. So this is information only: where the bar is, where
// the places to land are, which of them you have already taken, how many you have
// left, what the streak is worth, and how close the solo is.
//
// It says nothing in music-theory words. There is no "eighth", no "beat 3", no
// BPM and no bar number — a tick is a place to land and the feel has a name.

import type { Kit, Role } from '../audio/kits';
import { ROLE_COLORS } from '../audio/kits';
import { STEPS_PER_BAR } from '../audio/scale';
import { MIC_STATS, MIC_MAX_RANK, type FrontmanReadout, type PlacementResult } from './frontman';

export interface FrontmanStrip {
  render(readout: FrontmanReadout, layers: { mic: boolean; solo: boolean }): void;
  /** Momentary feedback on the last press: how far off, and whether it landed. */
  flash(result: PlacementResult): void;
  /** The readable version, for the pause screen. */
  renderPausePanel(readout: FrontmanReadout, into: HTMLElement): void;
  hide(): void;
}

function el(tag: string, className: string, parent: HTMLElement, text = ''): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  parent.appendChild(node);
  return node;
}

export function mountFrontmanStrip(root: HTMLElement, kits: Map<Role, Kit>): FrontmanStrip {
  const wrap = el('div', 'mic-strip', root);
  wrap.style.display = 'none';

  const top = el('div', 'mic-top', wrap);
  const micName = el('span', 'mic-name', top, 'NO MIC');
  const feelName = el('span', 'mic-feel', top, '');
  const placements = el('span', 'mic-places', top);
  const groove = el('span', 'mic-groove', top, '');
  const verdict = el('span', 'mic-verdict', top, '');

  const grid = el('div', 'mic-grid', wrap);
  const cells: HTMLElement[] = [];
  for (let i = 0; i < STEPS_PER_BAR; i++) cells.push(el('div', 'mic-cell', grid));

  const soloRow = el('div', 'mic-solo', wrap);
  const soloFill = el('div', 'mic-solo-fill', soloRow);
  const soloLabel = el('span', 'mic-solo-label', soloRow, 'SOLO');

  const ladder = el('div', 'mic-ladder', wrap);
  const rankRows = new Map<string, { pips: HTMLElement[]; row: HTMLElement }>();
  for (const stat of MIC_STATS) {
    const row = el('div', 'mic-rank', ladder);
    el('span', 'mic-rank-glyph', row, stat.glyph);
    const pipWrap = el('span', 'mic-rank-pips', row);
    const pips: HTMLElement[] = [];
    for (let i = 0; i < MIC_MAX_RANK; i++) pips.push(el('span', 'mic-pip', pipWrap));
    row.title = `${stat.name} — ${stat.blurb}`;
    rankRows.set(stat.id, { pips, row });
  }

  let verdictClearAt = 0;

  return {
    hide(): void {
      wrap.style.display = 'none';
    },

    /** THE HAND, IN WORDS — painted into `.pause-arrange`, the base's empty slot
     *  on the pause screen ([#265](https://github.com/yusufkinatas/loop-survivors/issues/265)'s
     *  fourth seam, "the one surface that stops the world without ending the run").
     *
     *  This is the right thing to hang there, because #248 found the real cap on a
     *  real-time build decision is READING TEXT DURING ACTION. The strip is
     *  glanceable and says nothing; here there is time to read what a rank
     *  actually bought and what the run's feel is asking of you. Nothing on this
     *  panel is a control — the pause screen states the build, it never edits it. */
    renderPausePanel(readout: FrontmanReadout, into: HTMLElement): void {
      into.replaceChildren();
      const head = el('div', 'pause-items-head', into);
      el('strong', '', head, 'THE MIC');
      el('span', '', head, readout.micRole ? kits.get(readout.micRole)!.name.toUpperCase() : 'NOBODY');

      const feel = el('div', 'pause-mic-feel', into);
      el('span', 'pause-mic-feel-name', feel, readout.feel.name);
      el('span', 'pause-mic-feel-blurb', feel, readout.feel.blurb);

      const list = el('div', 'pause-mic-list', into);
      for (const stat of MIC_STATS) {
        const rank = readout.ranks[stat.id];
        const row = el('div', `pause-mic-row ${rank === 0 ? 'neutral' : ''}`, list);
        el('span', 'pause-mic-glyph', row, stat.glyph);
        el('span', 'pause-mic-name', row, stat.name);
        el('span', 'pause-mic-blurb', row, stat.blurb);
        el('span', 'pause-mic-rank', row, rank === 0 ? '–' : `${rank}/${MIC_MAX_RANK}`);
      }
      if (readout.order) {
        const row = el('div', 'pause-mic-row', list);
        el('span', 'pause-mic-glyph', row, '↯');
        el('span', 'pause-mic-name', row, 'THE CALL');
        el('span', 'pause-mic-blurb', row, `your hits ${readout.order} the crowd`);
        el('span', 'pause-mic-rank', row, 'ON');
      }
    },

    flash(result: PlacementResult): void {
      // A number, not a word: the player needs to know WHICH WAY they were wrong,
      // because "late" and "early" are corrected by opposite adjustments.
      if (result.kind === 'landed') {
        verdict.textContent = `${result.offsetMs > 0 ? '+' : ''}${result.offsetMs}`;
        verdict.className = 'mic-verdict landed';
      } else if (result.kind === 'loose') {
        verdict.textContent = `${result.offsetMs > 0 ? '+' : ''}${result.offsetMs} LOOSE`;
        verdict.className = 'mic-verdict loose';
      } else if (result.kind === 'spent') {
        verdict.textContent = 'OUT OF PLACES';
        verdict.className = 'mic-verdict spent';
      } else if (result.kind === 'taken') {
        verdict.textContent = 'ALREADY THERE';
        verdict.className = 'mic-verdict spent';
      } else {
        return;
      }
      verdictClearAt = performance.now() + 750;
    },

    render(readout: FrontmanReadout, layers: { mic: boolean; solo: boolean }): void {
      if (!layers.mic) {
        wrap.style.display = 'none';
        return;
      }
      wrap.style.display = '';
      const role = readout.micRole;
      const color = role ? ROLE_COLORS[role] : 0x818b9d;
      wrap.style.setProperty('--mic-color', `#${color.toString(16).padStart(6, '0')}`);
      const entering = readout.micEntering;
      micName.textContent = role ? kits.get(role)!.name.toUpperCase() : 'NO MIC';
      micName.classList.toggle('entering', entering !== undefined);
      feelName.textContent = readout.feel.name;
      feelName.title = readout.feel.blurb;

      // Places left as pips rather than a number: it is a thing you are spending,
      // and a row of three going to two reads faster than "2".
      placements.replaceChildren();
      for (let i = 0; i < readout.placementsTotal; i++) {
        el('span', `mic-place ${i < readout.placementsLeft ? 'on' : ''}`, placements);
      }

      groove.textContent = readout.groove > 0 ? `×${readout.grooveMul.toFixed(2)} · ${readout.groove}` : '';
      groove.classList.toggle('hot', readout.grooveMul >= 1.45);

      const claimed = new Set(readout.claimed);
      const ticks = new Set(readout.ticks);
      for (let i = 0; i < cells.length; i++) {
        let cls = 'mic-cell';
        if (ticks.has(i)) cls += ' tick';
        if (claimed.has(i)) cls += ' taken';
        if (i === readout.playhead) cls += ' here';
        cells[i].className = cls;
      }

      if (layers.solo) {
        soloRow.style.display = '';
        soloFill.style.width = `${readout.soloMeter}%`;
        soloRow.classList.toggle('ready', readout.soloReady);
        soloRow.classList.toggle('live', readout.soloBarsLeft > 0);
        soloLabel.textContent = readout.soloBarsLeft > 0
          ? `SOLO · ${readout.soloBarsLeft} · ${readout.soloLanded} PLACED`
          : readout.soloReady
            ? 'SOLO READY'
            : 'SOLO';
      } else {
        soloRow.style.display = 'none';
      }

      for (const stat of MIC_STATS) {
        const row = rankRows.get(stat.id)!;
        const rank = readout.ranks[stat.id];
        row.row.classList.toggle('empty', rank === 0);
        for (let i = 0; i < row.pips.length; i++) {
          row.pips[i].classList.toggle('on', i < rank);
        }
      }

      if (verdictClearAt && performance.now() > verdictClearAt) {
        verdict.textContent = '';
        verdictClearAt = 0;
      }
    },
  };
}
