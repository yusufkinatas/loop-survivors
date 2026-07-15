// The rehearsal room: a no-pressure mode to assemble any build by hand, add
// and remove voices live, scrub a simulated progression from lone instrument
// to full arrangement, and listen. First-class deliverable of M1 sub-phase A
// (docs/phases/m1-demo.md). This is where sample packs are curated: the
// "load" button on each voice auditions any local audio file in place of the
// builtin placeholder sample.

import { MusicEngine } from '../audio/engine';
import { type Role } from '../audio/kits';
import { SKELETON, STEPS_PER_BAR, STEPS_PER_PHRASE, BARS_PER_PHRASE } from '../audio/scale';
import { supportedRoles } from '../audio/soundset';
import { mountPlayground, type Playground } from './playground';

/** The progression scrub walks a scripted run of picks (M2: a pick is a new
 *  weapon or a tier-up). Two arcs, one per end-of-run archetype: wide-shallow
 *  collects every voice at low tiers, narrow-deep maxes a few voices. The
 *  right end of the slider is the full end-of-run mix. */
interface ArcPick {
  role: Role;
  tier: number;
}
const ARCS: Record<string, { label: string; picks: ArcPick[] }> = {
  wide: {
    label: 'wide-shallow',
    picks: [
      { role: 'kick', tier: 1 },
      { role: 'hat', tier: 1 },
      { role: 'snare', tier: 1 },
      { role: 'bass', tier: 1 },
      { role: 'chord', tier: 1 },
      { role: 'lead', tier: 1 },
      { role: 'kick', tier: 2 },
      { role: 'hat', tier: 2 },
      { role: 'snare', tier: 2 },
      { role: 'bass', tier: 2 },
      { role: 'chord', tier: 2 },
      { role: 'lead', tier: 2 },
    ],
  },
  deep: {
    label: 'narrow-deep',
    picks: [
      { role: 'kick', tier: 1 },
      { role: 'bass', tier: 1 },
      { role: 'kick', tier: 2 },
      { role: 'bass', tier: 2 },
      { role: 'lead', tier: 1 },
      { role: 'bass', tier: 3 },
      { role: 'kick', tier: 3 },
      { role: 'lead', tier: 2 },
      { role: 'bass', tier: 4 },
      { role: 'kick', tier: 4 },
      { role: 'lead', tier: 3 },
      { role: 'lead', tier: 4 },
    ],
  },
};

interface VoiceUi {
  card: HTMLElement;
  light: HTMLElement;
  toggle: HTMLInputElement;
}

export function mountRehearsalRoom(root: HTMLElement, engine: MusicEngine): void {
  const voiceUis = new Map<Role, VoiceUi>();
  // Only the instruments the game actually voices. The full ROLES catalog still
  // carries dormant sounds the soundset builds no weapon around (tom, crash,
  // shaker, acid, pluck, rhodes, riser); those are not playable, so the room
  // does not show them.
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

  // ---- progression scrub: pick by pick through a whole run's arc ----
  const scrubRow = el('div', 'scrub-row', root);
  el('span', 'sets-label', scrubRow, 'run arc');
  let currentArc = 'wide';
  const arcButtons = new Map<string, HTMLButtonElement>();
  for (const [id, arc] of Object.entries(ARCS)) {
    const btn = el('button', 'set-btn', scrubRow, arc.label) as HTMLButtonElement;
    btn.onclick = () => {
      currentArc = id;
      applyArc(Number(scrub.value));
    };
    arcButtons.set(id, btn);
  }
  const fullMixBtn = el('button', 'set-btn full-mix', scrubRow, '⇥ end-of-run mix') as HTMLButtonElement;
  fullMixBtn.title = 'jump to the arc’s full end-of-run build';
  fullMixBtn.onclick = () => {
    scrub.value = scrub.max;
    applyArc(Number(scrub.max));
  };

  const scrubWrap = el('label', 'scrub', root, 'progression scrub: the build grows pick by pick');
  const scrub = el('input', '', scrubWrap) as HTMLInputElement;
  scrub.type = 'range';
  scrub.min = '0';
  scrub.max = String(ARCS.wide.picks.length);
  scrub.value = '0';
  const scrubReadout = el('span', 'scrub-readout', scrubWrap, 'no picks');
  scrub.oninput = () => applyArc(Number(scrub.value));

  function applyArc(count: number): void {
    const arc = ARCS[currentArc];
    for (const [id, b] of arcButtons) b.classList.toggle('current', id === currentArc);
    const tiers = new Map<Role, number>();
    for (const pick of arc.picks.slice(0, count)) {
      tiers.set(pick.role, Math.max(pick.tier, tiers.get(pick.role) ?? 0));
    }
    for (const role of playable) {
      const tier = tiers.get(role);
      if (tier) engine.setVoiceTier(role, tier);
      setVoice(role, tier !== undefined);
    }
    const last = count > 0 ? arc.picks[count - 1] : null;
    scrubReadout.textContent = last
      ? `pick ${count}/${arc.picks.length}: ${last.role} ${['I', 'II', 'III', 'IV'][last.tier - 1]}`
      : 'no picks';
    playground.refresh();
  }

  // ---- voice cards ----
  const grid = el('div', 'voices', root);
  for (const role of playable) {
    const voice = engine.voices.get(role)!;
    const card = el('div', 'voice', grid);
    card.style.setProperty('--voice-color', voice.kit.color);

    const head = el('div', 'voice-head', card);
    const light = el('span', 'light', head);
    el('span', 'voice-name', head, voice.kit.name);
    el('span', 'voice-key', head, String(playable.indexOf(role) + 1));

    const toggleWrap = el('label', 'row', card, 'in the mix');
    const toggle = el('input', '', toggleWrap) as HTMLInputElement;
    toggle.type = 'checkbox';
    toggle.onchange = () => {
      setVoice(role, toggle.checked, false);
      playground.refresh();
    };

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
    if (idx >= 0 && idx < playable.length) {
      const role = playable[idx];
      setVoice(role, !engine.voices.get(role)!.enabled);
      playground.refresh();
    }
  });

  // ---- frame loop: trigger lights and position readout ----
  engine.addTriggerListener((t) => {
    const light = voiceUis.get(t.role)!.light;
    light.classList.remove('lit');
    void light.offsetWidth; // restart the CSS animation
    light.classList.add('lit');
  });

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
