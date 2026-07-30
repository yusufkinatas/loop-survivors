// THE GIG's screens. Three of them, and all three obey #253's rewritten pillar
// 3 — *the music is the reward, the screen is the information*:
//
//   THE CARD     top of the arena. Which song, how long is left, what tempo.
//   THE STRIP    bottom of the arena, only while a pass is live. The tape you
//                are cutting: the grid, the playhead, what you have laid, and
//                how much budget is left.
//   THE RACK     the set, drawn as one mini strip per track. Lives on the pause
//                screen's `.pause-arrange` slot — the empty node #265 left
//                mounted for exactly this — and again inside the changeover.
//
// NOTHING HERE IS STATED IN MUSIC-THEORY TERMS. No key, no scale, no note name,
// no BPM as a number the player is asked to reason about (the card shows the
// tempo the way a tape deck does, as a speed you can see change, not as a
// parameter). Pillar 2's ceiling is L2 and this is what L2 looks like on screen:
// a grid of sixteen slots and a moving playhead.

import type { Kit, Role } from '../../audio/kits';
import { STEPS_PER_BAR } from '../../audio/scale';
import type { RecordMode } from './recorder';
import type { GigSection } from './songs';
import { takeDensity, type Take } from './tape';

export interface StripView {
  role: Role;
  mode: RecordMode;
  bars: number;
  /** False during the count-in. */
  open: boolean;
  budget: number;
  laid: readonly number[];
  existing: readonly number[];
  /** Fractional loop step, or null during the count-in. */
  playhead: number | null;
}

export interface TrackView {
  role: Role;
  slot: number;
  level: number;
  take: Take | null;
  /** True while this track is the one being cut. */
  recording: boolean;
  /** True while the player has switched it off. */
  off: boolean;
}

export interface ChangeoverView {
  /** Whole seconds left. */
  remainS: number;
  nextName: string;
  nextBpm: number;
  tracks: readonly TrackView[];
  /** Set while the player is choosing a replacement for a dropped track. */
  awaitingSwap: boolean;
  swapEnabled: boolean;
}

const MODE_COPY: Record<RecordMode, string> = {
  fresh: 'NEW TAKE',
  overdub: 'OVERDUB',
  recut: 'RE-CUT',
};

export interface GigUi {
  /** The song card. `null` hides it. */
  setCard(section: GigSection | null, remainS: number): void;
  /** Show / update the recording strip. `null` hides it. */
  setStrip(view: StripView | null): void;
  /** The changeover overlay. `null` hides it. */
  setChangeover(view: ChangeoverView | null): void;
  /** Paint the set into any node — the pause screen uses this. */
  paintRack(into: HTMLElement, tracks: readonly TrackView[]): void;
  destroy(): void;
}

export function mountGigUi(root: HTMLElement, kits: Map<Role, Kit>): GigUi {
  const card = el('div', 'gig-card');
  const cardLabel = el('div', 'gig-card-label');
  const cardName = el('div', 'gig-card-name');
  const cardMeta = el('div', 'gig-card-meta');
  card.append(cardLabel, cardName, cardMeta);
  card.style.display = 'none';

  const strip = el('div', 'gig-strip');
  const stripHead = el('div', 'gig-strip-head');
  const stripRole = el('span', 'gig-strip-role');
  const stripMode = el('span', 'gig-strip-mode');
  const stripBudget = el('span', 'gig-strip-budget');
  stripHead.append(stripRole, stripMode, stripBudget);
  const stripBars = el('div', 'gig-strip-bars');
  const stripHint = el('div', 'gig-strip-hint');
  strip.append(stripHead, stripBars, stripHint);
  strip.style.display = 'none';

  const changeover = el('div', 'gig-changeover');
  const coTitle = el('div', 'gig-co-title');
  const coClock = el('div', 'gig-co-clock');
  const coRack = el('div', 'gig-co-rack');
  const coHint = el('div', 'gig-co-hint');
  changeover.append(coTitle, coClock, coRack, coHint);
  changeover.style.display = 'none';

  root.append(card, strip, changeover);

  // Strip state, so a frame that changes nothing touches no DOM.
  let stripKey = '';
  let cells: HTMLElement[] = [];
  let litCount = -1;
  let lastHead = -1;
  let lastBudget = '';
  let lastCardKey = '';
  let lastCoKey = '';

  function setCard(section: GigSection | null, remainS: number): void {
    if (!section) {
      card.style.display = 'none';
      lastCardKey = '';
      return;
    }
    const seconds = Math.max(0, Math.ceil(remainS));
    const key = `${section.name}|${seconds}`;
    if (key === lastCardKey) return;
    lastCardKey = key;
    card.style.display = '';
    card.classList.toggle('is-encore', section.kind === 'encore');
    card.classList.toggle('is-changeover', section.kind === 'changeover');
    cardLabel.textContent = section.label;
    cardName.textContent = section.name;
    const mmss = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    // The tempo is shown as a row of pulse marks rather than a number: three
    // songs at three speeds, legible at a glance, and no BPM on screen.
    cardMeta.textContent = `${mmss}  ${pulseMarks(section.bpm)}`;
  }

  function setStrip(view: StripView | null): void {
    if (!view) {
      if (strip.style.display !== 'none') {
        strip.style.display = 'none';
        stripKey = '';
      }
      return;
    }
    const key = `${view.role}|${view.mode}|${view.bars}|${view.existing.length}|${view.budget}`;
    if (key !== stripKey) {
      stripKey = key;
      strip.style.display = '';
      strip.style.setProperty('--voice-color', kits.get(view.role)?.color ?? '#fff');
      stripRole.textContent = (kits.get(view.role)?.name ?? view.role).toUpperCase();
      stripMode.textContent = MODE_COPY[view.mode];
      stripBars.replaceChildren();
      cells = [];
      for (let bar = 0; bar < view.bars; bar++) {
        const barEl = el('div', 'gig-bar');
        for (let i = 0; i < STEPS_PER_BAR; i++) {
          const cell = el('span', `gig-cell${i % 4 === 0 ? ' beat' : ''}`);
          barEl.appendChild(cell);
          cells.push(cell);
        }
        stripBars.appendChild(barEl);
      }
      for (const step of view.existing) cells[step]?.classList.add('kept');
      litCount = -1;
      lastHead = -1;
      lastBudget = '';
      stripHint.textContent = view.budget <= 0
        ? 'tape full — the loop comes back on the bar line'
        : 'SPACE or TAP to play  ·  ENTER to keep it';
    }
    strip.classList.toggle('counting', !view.open);
    if (view.laid.length !== litCount) {
      litCount = view.laid.length;
      for (const step of view.laid) cells[step]?.classList.add('laid');
    }
    const head = view.playhead === null ? -1 : Math.floor(view.playhead);
    if (head !== lastHead) {
      if (lastHead >= 0) cells[lastHead]?.classList.remove('head');
      if (head >= 0) cells[head]?.classList.add('head');
      lastHead = head;
    }
    const left = Math.max(0, view.budget - view.laid.length);
    const budget = view.budget <= 0 ? '—' : `${'●'.repeat(left)}${'○'.repeat(view.laid.length)}`;
    if (budget !== lastBudget) {
      lastBudget = budget;
      stripBudget.textContent = budget;
    }
  }

  function setChangeover(view: ChangeoverView | null): void {
    if (!view) {
      changeover.style.display = 'none';
      lastCoKey = '';
      return;
    }
    changeover.style.display = '';
    // While the player is choosing a replacement, the overlay gets out of the
    // way: the pedestals are on the floor and they have to be able to see them.
    changeover.classList.toggle('choosing', view.awaitingSwap);
    const key = `${view.remainS}|${view.awaitingSwap}|${view.tracks
      .map((t) => `${t.role}${t.level}${t.take?.steps.length ?? 0}${t.recording ? 'r' : ''}`)
      .join(',')}`;
    if (key === lastCoKey) return;
    lastCoKey = key;
    coTitle.textContent = `CHANGEOVER  ·  UP NEXT: ${view.nextName}`;
    coClock.textContent = `${view.remainS}`;
    paintRack(coRack, view.tracks);
    coHint.textContent = view.awaitingSwap
      ? 'walk onto an instrument to bring it in — it inherits half the tape'
      : view.swapEnabled
        ? '1–5 re-cut a take  ·  SHIFT+1–5 drop it and bring someone else in'
        : '1–5 re-cut a take';
  }

  /** One row per track: slot, name, tape pips, and the take itself drawn on a
   *  strip. This is the whole build in one picture, which is the thing the base
   *  could not show — a rack of names says nothing about what the band plays. */
  function paintRack(into: HTMLElement, tracks: readonly TrackView[]): void {
    into.replaceChildren();
    if (tracks.length === 0) {
      into.appendChild(el('div', 'gig-rack-empty', 'no tape yet'));
      return;
    }
    for (const track of tracks) {
      const row = el('div', 'gig-rack-row');
      if (track.recording) row.classList.add('recording');
      if (track.off) row.classList.add('off');
      row.style.setProperty('--voice-color', kits.get(track.role)?.color ?? '#fff');
      row.appendChild(el('span', 'gig-rack-slot', String(track.slot)));
      row.appendChild(el('span', 'gig-rack-name', kits.get(track.role)?.name ?? track.role));
      const pips = el('span', 'gig-rack-pips');
      for (let i = 1; i <= 8; i++) pips.appendChild(el('span', `pip${i <= track.level ? ' on' : ''}`));
      row.appendChild(pips);
      const mini = el('span', 'gig-rack-take');
      const take = track.take;
      const bars = take?.bars ?? 1;
      const hits = new Set(take?.steps ?? []);
      for (let step = 0; step < bars * STEPS_PER_BAR; step++) {
        const cell = el('span', `gig-mini${step % 4 === 0 ? ' beat' : ''}${hits.has(step) ? ' hit' : ''}`);
        mini.appendChild(cell);
      }
      row.appendChild(mini);
      row.appendChild(el('span', 'gig-rack-density',
        take ? `${takeDensity(take).toFixed(2)}/bar` : '—'));
      into.appendChild(row);
    }
  }

  return {
    setCard,
    setStrip,
    setChangeover,
    paintRack,
    destroy(): void {
      card.remove();
      strip.remove();
      changeover.remove();
    },
  };
}

/** The tempo, as something you can see rather than a number: one mark per
 *  ten BPM over ninety. Slow reads short, fast reads long, and the player never
 *  has to know what a BPM is. */
function pulseMarks(bpm: number): string {
  const marks = Math.max(1, Math.round((bpm - 85) / 10));
  return '▮'.repeat(marks);
}

function el(tag: string, className: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
