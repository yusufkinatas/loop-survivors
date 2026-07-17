// The rehearsal room: a no-pressure mode to sculpt every voice's chart by
// hand while the loop plays, toggle voices in and out of the mix, mix their
// volume, and listen. First-class deliverable of M1 sub-phase A
// (docs/phases/m1-demo.md).

import { MusicEngine } from '../audio/engine';
import { type Role } from '../audio/kits';
import { SKELETON, STEPS_PER_BAR, STEPS_PER_PHRASE, BARS_PER_PHRASE } from '../audio/scale';
import { supportedRoles } from '../audio/soundset';
import { mountPlayground, type Playground } from './playground';

export function mountRehearsalRoom(root: HTMLElement, engine: MusicEngine): void {
  // Only the instruments the game actually voices. The full ROLES catalog still
  // carries dormant sounds the soundset builds no weapon around (tom, crash,
  // shaker, acid, pluck, rhodes, riser); those are not playable, so the room
  // does not show them. Used by the number-key hotkeys below.
  const playable = supportedRoles();

  root.innerHTML = '';
  const el = (tag: string, className: string, parent: HTMLElement, text = ''): HTMLElement => {
    const node = document.createElement(tag);
    node.className = className;
    if (text) node.textContent = text;
    parent.appendChild(node);
    return node;
  };

  // ---- transport bar ----
  const bar = el('div', 'transport', root);
  const backBtn = el('button', 'small', bar, '← game') as HTMLButtonElement;
  backBtn.onclick = () => {
    location.hash = '';
  };
  const playBtn = el('button', 'play', bar, '▶ play') as HTMLButtonElement;
  const position = el('span', 'position', bar, '—');

  const bpmWrap = el('label', 'knob', bar, `tempo ${engine.clock.bpm}`);
  const bpm = el('input', '', bpmWrap) as HTMLInputElement;
  bpm.type = 'range';
  bpm.min = '90';
  bpm.max = '180';
  bpm.value = String(engine.clock.bpm);
  bpm.oninput = () => {
    engine.clock.bpm = Number(bpm.value);
    bpmWrap.firstChild!.textContent = `tempo ${bpm.value}`;
  };

  const setPlaying = (on: boolean) => {
    if (on) {
      void engine.ctx.resume();
      engine.clock.start();
      playBtn.textContent = '■ stop';
    } else {
      engine.clock.stop();
      playBtn.textContent = '▶ play';
      position.textContent = '—';
    }
  };
  playBtn.onclick = () => setPlaying(!engine.clock.running);

  // ---- chart playground: the whole arrangement, editable while it plays ----
  el(
    'div',
    'pg-caption',
    root,
    'chart playground — every voice’s chart across one 4-bar phrase. Pick a tier (I–IV), ' +
      'click a cell to place a hit (clicks again soften, then remove it); right-click a ' +
      'pitched hit to change its sound. The loop keeps playing: sculpt by ear.',
  );
  const playground: Playground = mountPlayground(el('div', '', root), engine, {
    editable: true,
    onToggleVoice: (role) => {
      setVoice(role, !engine.voices.get(role)!.enabled);
      playground.refresh();
    },
  });

  function setVoice(role: Role, on: boolean): void {
    engine.setVoiceEnabled(role, on);
  }

  // ---- hotkeys ----
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement && e.target.type !== 'range') return;
    if (e.code === 'Space') {
      e.preventDefault();
      setPlaying(!engine.clock.running);
    }
    const idx = Number(e.key) - 1;
    if (idx >= 0 && idx < playable.length) {
      const role = playable[idx];
      setVoice(role, !engine.voices.get(role)!.enabled);
      playground.refresh();
    }
  });

  // ---- frame loop: position readout (per-voice fire flashes live on the
  // chart cells, wired inside the playground) ----
  function frame(): void {
    engine.update();
    if (engine.clock.running) {
      const phraseStep = engine.currentStep() % STEPS_PER_PHRASE;
      const barNo = Math.floor(phraseStep / STEPS_PER_BAR) + 1;
      const beatNo = Math.floor((phraseStep % STEPS_PER_BAR) / SKELETON.stepsPerBeat) + 1;
      position.textContent = `bar ${barNo}/${BARS_PER_PHRASE} · beat ${beatNo}`;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
