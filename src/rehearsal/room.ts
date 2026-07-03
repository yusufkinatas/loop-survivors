// The rehearsal room: a no-pressure mode to assemble any build by hand, add
// and remove voices live, scrub a simulated progression from lone instrument
// to full arrangement, and listen. First-class deliverable of M1 sub-phase A
// (docs/phases/m1-demo.md). This is where sample packs are curated: the
// "load" button on each voice auditions any local audio file in place of the
// builtin placeholder sample.

import { MusicEngine } from '../audio/engine';
import { ROLES, type Role } from '../audio/kits';
import { SKELETON, STEPS_PER_BAR } from '../audio/scale';

/** Voice order used by the progression scrub: lone instrument -> full mix. */
const PROGRESSION: readonly Role[] = ['kick', 'hat', 'snare', 'bass', 'chord', 'lead'];

interface VoiceUi {
  card: HTMLElement;
  light: HTMLElement;
  toggle: HTMLInputElement;
}

export function mountRehearsalRoom(root: HTMLElement, engine: MusicEngine): void {
  const voiceUis = new Map<Role, VoiceUi>();

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
  const playBtn = el('button', 'play', bar, '▶ play') as HTMLButtonElement;
  const position = el('span', 'position', bar, '—');

  const bpmWrap = el('label', 'knob', bar, `tempo ${engine.clock.bpm}`);
  const bpm = el('input', '', bpmWrap) as HTMLInputElement;
  bpm.type = 'range';
  bpm.min = '90';
  bpm.max = '130';
  bpm.value = String(engine.clock.bpm);
  bpm.oninput = () => {
    engine.clock.bpm = Number(bpm.value);
    bpmWrap.firstChild!.textContent = `tempo ${bpm.value}`;
  };

  const masterWrap = el('label', 'knob', bar, 'master');
  const master = el('input', '', masterWrap) as HTMLInputElement;
  master.type = 'range';
  master.min = '0';
  master.max = '100';
  master.value = '80';
  master.oninput = () => engine.setMasterGain(Number(master.value) / 100);

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

  // ---- progression scrub ----
  const scrubWrap = el('label', 'scrub', root, 'progression scrub: build grows voice by voice');
  const scrub = el('input', '', scrubWrap) as HTMLInputElement;
  scrub.type = 'range';
  scrub.min = '0';
  scrub.max = String(PROGRESSION.length);
  scrub.value = '0';
  scrub.oninput = () => {
    const count = Number(scrub.value);
    PROGRESSION.forEach((role, i) => setVoice(role, i < count));
  };

  // ---- voice cards ----
  const grid = el('div', 'voices', root);
  for (const role of ROLES) {
    const voice = engine.voices.get(role)!;
    const card = el('div', 'voice', grid);
    card.style.setProperty('--voice-color', voice.kit.color);

    const head = el('div', 'voice-head', card);
    const light = el('span', 'light', head);
    el('span', 'voice-name', head, voice.kit.name);
    el('span', 'voice-key', head, String(ROLES.indexOf(role) + 1));

    const toggleWrap = el('label', 'row', card, 'in the mix');
    const toggle = el('input', '', toggleWrap) as HTMLInputElement;
    toggle.type = 'checkbox';
    toggle.onchange = () => setVoice(role, toggle.checked, false);

    const volWrap = el('label', 'row', card, 'volume');
    const vol = el('input', '', volWrap) as HTMLInputElement;
    vol.type = 'range';
    vol.min = '0';
    vol.max = '100';
    vol.value = '100';
    vol.oninput = () => engine.setVoiceGain(role, Number(vol.value) / 100);

    const tools = el('div', 'tools', card);
    const previewBtn = el('button', 'small', tools, 'hit') as HTMLButtonElement;
    previewBtn.onclick = () => {
      void engine.ctx.resume();
      engine.preview(role);
    };

    // Sample curation: audition any local file over the builtin sample.
    const file = document.createElement('input');
    file.type = 'file';
    file.accept = 'audio/*';
    file.style.display = 'none';
    tools.appendChild(file);
    const loadBtn = el('button', 'small', tools, 'load sample') as HTMLButtonElement;
    loadBtn.onclick = () => file.click();
    const resetBtn = el('button', 'small hidden', tools, 'reset') as HTMLButtonElement;
    file.onchange = async () => {
      const f = file.files?.[0];
      if (!f) return;
      voice.override = await engine.ctx.decodeAudioData(await f.arrayBuffer());
      loadBtn.textContent = f.name.length > 18 ? f.name.slice(0, 15) + '…' : f.name;
      resetBtn.classList.remove('hidden');
    };
    resetBtn.onclick = () => {
      voice.override = null;
      loadBtn.textContent = 'load sample';
      resetBtn.classList.add('hidden');
      file.value = '';
    };

    voiceUis.set(role, { card, light, toggle });
  }

  function setVoice(role: Role, on: boolean, syncToggle = true): void {
    engine.setVoiceEnabled(role, on);
    const ui = voiceUis.get(role)!;
    if (syncToggle) ui.toggle.checked = on;
    ui.card.classList.toggle('active', on);
  }

  // ---- hotkeys ----
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement && e.target.type !== 'range') return;
    if (e.code === 'Space') {
      e.preventDefault();
      setPlaying(!engine.clock.running);
    }
    const idx = Number(e.key) - 1;
    if (idx >= 0 && idx < ROLES.length) {
      const role = ROLES[idx];
      setVoice(role, !engine.voices.get(role)!.enabled);
    }
  });

  // ---- frame loop: trigger lights and position readout ----
  function frame(): void {
    for (const t of engine.drainDueTriggers()) {
      const light = voiceUis.get(t.role)!.light;
      light.classList.remove('lit');
      void light.offsetWidth; // restart the CSS animation
      light.classList.add('lit');
    }
    if (engine.clock.running) {
      const step = engine.currentStep();
      const barNo = Math.floor(step / STEPS_PER_BAR) + 1;
      const beatNo = Math.floor((step % STEPS_PER_BAR) / SKELETON.stepsPerBeat) + 1;
      position.textContent = `bar ${barNo} · beat ${beatNo}`;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
