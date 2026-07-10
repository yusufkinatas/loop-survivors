// The Experimentation room (#tracklab): a standalone lab for auditioning
// reverse-engineered covers of real tracks through the LabEngine. It was the
// M3 proof-of-concept surface; the full-track game direction it explored was
// dropped, but the room is kept for experimentation. Read-only grids, voice
// mutes and solos for A/Bing what each layer contributes, section switching
// for manual loops, optional full-arrangement playback, and a tempo nudge for
// taste. (Internal name: Track Lab.)

import { LabEngine } from './labengine';
import { TRACKS } from './tracks';
import type { LabChart, LabTrack, LabVoiceDef } from './tracks/types';

const STEPS_PER_BAR = 16;

const noteLabel = (n: number) => (n === 0 ? '0·root' : n > 0 ? `+${n}` : `−${-n}`);

interface RowDef {
  key: string;
  label: string;
  variant?: string;
  note?: number;
}

function rowsFor(def: LabVoiceDef, track: LabTrack, samples: Map<string, AudioBuffer>): RowDef[] {
  if (!def.pitched) {
    return [...samples.keys()].map((v) => ({ key: `v${v}`, label: v, variant: v }));
  }
  const notes = new Set(def.noteRows ?? [0]);
  for (const section of track.sections) {
    const chart = section.charts[def.id];
    if (chart) for (const ev of chart.events) notes.add(ev.note ?? 0);
  }
  return [...notes].sort((a, b) => b - a).map((n) => ({ key: `n${n}`, label: noteLabel(n), note: n }));
}

export function mountTrackLab(root: HTMLElement, ctx: AudioContext): void {
  root.innerHTML = '';
  const el = (tag: string, className: string, parent: HTMLElement, text = ''): HTMLElement => {
    const node = document.createElement(tag);
    node.className = className;
    if (text) node.textContent = text;
    parent.appendChild(node);
    return node;
  };

  let engine: LabEngine | null = null;
  let track: LabTrack | null = null;

  // ---- transport ----
  const bar = el('div', 'transport', root);
  el('span', 'lab-title', bar, 'experimentation room');
  const backBtn = el('button', 'small', bar, '← game') as HTMLButtonElement;
  backBtn.onclick = () => {
    location.hash = '';
  };
  const roomBtn = el('button', 'small', bar, 'rehearsal room') as HTMLButtonElement;
  roomBtn.onclick = () => {
    location.hash = '#rehearsal';
  };
  const playBtn = el('button', 'play', bar, '▶ play') as HTMLButtonElement;
  playBtn.disabled = true;
  const arrangementBtn = el(
    'button',
    'small',
    bar,
    '▶ play full arrangement',
  ) as HTMLButtonElement;
  arrangementBtn.disabled = true;
  arrangementBtn.style.display = 'none';
  const position = el('span', 'position', bar, 'pick a track');

  const tempoWrap = el('label', 'knob', bar, 'tempo —');
  const tempo = el('input', '', tempoWrap) as HTMLInputElement;
  tempo.type = 'range';
  tempo.min = '85';
  tempo.max = '115';
  tempo.value = '100';
  tempo.oninput = () => {
    if (!engine || !track) return;
    engine.setTempoScale(Number(tempo.value) / 100);
    tempoWrap.firstChild!.textContent = `tempo ${Math.round(track.bpm * (Number(tempo.value) / 100))}`;
  };

  const masterWrap = el('label', 'knob', bar, 'master');
  const master = el('input', '', masterWrap) as HTMLInputElement;
  master.type = 'range';
  master.min = '0';
  master.max = '100';
  master.value = '80';
  master.oninput = () => engine?.setMasterGain(Number(master.value) / 100);

  const syncTransport = () => {
    const running = engine?.clock.running ?? false;
    const arranging = engine?.playingArrangement ?? false;
    playBtn.textContent = running ? '■ stop' : '▶ play';
    arrangementBtn.textContent = arranging
      ? '■ stop full arrangement'
      : '▶ play full arrangement';
    arrangementBtn.classList.toggle('current', arranging);
  };

  const setPlaying = (on: boolean) => {
    if (!engine) return;
    if (on) engine.start();
    else {
      engine.stop();
      position.textContent = '—';
    }
    syncTransport();
  };
  playBtn.onclick = () => engine && setPlaying(!engine.clock.running);
  arrangementBtn.onclick = () => {
    if (!engine) return;
    if (engine.playingArrangement) {
      engine.stop();
      position.textContent = '—';
    } else {
      engine.startArrangement();
    }
    syncTransport();
  };

  // ---- track cards ----
  const tracksRow = el('div', 'sets', root);
  el('span', 'sets-label', tracksRow, 'track');
  const status = el('span', 'sets-status', tracksRow);
  const trackButtons = new Map<string, HTMLButtonElement>();
  // Full-playthrough studies sort to the front automatically as authors add
  // arrangement metadata; no second registry or hardcoded featured list.
  const displayTracks = [...TRACKS].sort(
    (a, b) => Number(Boolean(b.arrangement?.length)) - Number(Boolean(a.arrangement?.length)),
  );
  for (const t of displayTracks) {
    const hasArrangement = Boolean(t.arrangement?.length);
    const btn = el(
      'button',
      'set-btn',
      tracksRow,
      `${hasArrangement ? '★ ' : ''}${t.title} — ${t.artist}`,
    ) as HTMLButtonElement;
    const arrangementBars = t.arrangement?.reduce((sum, entry) => sum + entry.bars, 0) ?? 0;
    btn.title =
      `${t.genre} · ${t.bpm} bpm · ${t.bars}-bar loop` +
      (hasArrangement ? ` · ${arrangementBars}-bar full arrangement` : '');
    btn.onclick = () => void loadTrack(t);
    trackButtons.set(t.id, btn);
    tracksRow.insertBefore(btn, status);
  }

  const blurb = el('p', 'pg-caption lab-notes', root);

  // ---- sections ----
  const sectionsRow = el('div', 'sets', root);
  el('span', 'sets-label', sectionsRow, 'section');
  const sectionButtons = new Map<string, HTMLButtonElement>();

  // ---- voices + grid hosts ----
  const voicesHost = el('div', 'voices', root);
  const gridScroll = el('div', 'lab-scroll', root);
  const gridHost = el('div', 'playground', gridScroll);

  interface VoiceUi {
    card: HTMLElement;
    light: HTMLElement;
    toggle: HTMLInputElement;
    soloBtn: HTMLButtonElement;
  }
  const voiceUis = new Map<string, VoiceUi>();
  interface GridSection {
    body: HTMLElement;
    playhead: HTMLElement;
    cellsByRowStep: Map<string, HTMLElement>;
  }
  const gridSections = new Map<string, GridSection>();
  let soloed: string | null = null;
  let preSolo = new Map<string, boolean>();

  async function loadTrack(t: LabTrack): Promise<void> {
    for (const b of trackButtons.values()) b.disabled = true;
    playBtn.disabled = true;
    arrangementBtn.disabled = true;
    status.textContent = 'building instruments…';
    try {
      const wasPlaying = engine?.clock.running ?? false;
      engine?.dispose();
      engine = await LabEngine.load(ctx, t);
      track = t;
      soloed = null;
      wireEngine();
      buildVoicesAndGrid();
      buildSections();
      for (const [id, b] of trackButtons) b.classList.toggle('current', id === t.id);
      blurb.textContent = t.notes ?? '';
      tempo.value = '100';
      tempoWrap.firstChild!.textContent = `tempo ${t.bpm}`;
      engine.setMasterGain(Number(master.value) / 100);
      playBtn.disabled = false;
      const hasArrangement = Boolean(t.arrangement?.length);
      arrangementBtn.disabled = !hasArrangement;
      arrangementBtn.style.display = hasArrangement ? '' : 'none';
      position.textContent = '—';
      status.textContent = '';
      if (wasPlaying) setPlaying(true);
      else syncTransport();
    } catch (err) {
      status.textContent = `failed: ${err instanceof Error ? err.message : err}`;
    } finally {
      for (const b of trackButtons.values()) b.disabled = false;
    }
  }

  function buildSections(): void {
    sectionsRow.querySelectorAll('button').forEach((b) => b.remove());
    sectionButtons.clear();
    if (!engine || !track) return;
    for (const s of track.sections) {
      const btn = el('button', 'set-btn', sectionsRow, s.name) as HTMLButtonElement;
      btn.onclick = () => {
        engine!.setSection(s.id);
        btn.classList.add('pending');
        syncTransport();
      };
      sectionButtons.set(s.id, btn);
    }
    markSection(engine.sectionId);
  }

  function markSection(id: string): void {
    for (const [sid, b] of sectionButtons) {
      b.classList.toggle('current', sid === id);
      b.classList.remove('pending');
    }
  }

  function wireEngine(): void {
    if (!engine) return;
    engine.onSectionChange((id) => {
      markSection(id);
      renderGrid();
    });
    engine.addTriggerListener((t) => {
      const ui = voiceUis.get(t.voiceId);
      if (ui) {
        ui.light.classList.remove('lit');
        void ui.light.offsetWidth;
        ui.light.classList.add('lit');
      }
      if (t.step < 0) return;
      const voice = engine!.voices.get(t.voiceId);
      if (!voice) return;
      const rowKey = voice.def.pitched ? `n${t.note ?? 0}` : `v${t.variant ?? voice.defaultVariant}`;
      const cell = gridSections.get(t.voiceId)?.cellsByRowStep.get(`${rowKey}|${t.step}`);
      if (!cell) return;
      cell.classList.remove('firing');
      void cell.offsetWidth;
      cell.classList.add('firing');
    });
  }

  function setVoice(id: string, on: boolean, syncToggle = true): void {
    if (!engine) return;
    engine.setVoiceEnabled(id, on);
    const ui = voiceUis.get(id)!;
    if (syncToggle) ui.toggle.checked = on;
    ui.card.classList.toggle('active', on);
    gridSections.get(id)?.body.parentElement!.classList.toggle('active', on);
  }

  function toggleSolo(id: string): void {
    if (!engine) return;
    if (soloed === id) {
      soloed = null;
      for (const [vid, was] of preSolo) setVoice(vid, was);
    } else {
      if (soloed === null) {
        preSolo = new Map(
          [...engine.voices.entries()].map(([vid, v]) => [vid, v.enabled]),
        );
      }
      soloed = id;
      for (const vid of engine.voices.keys()) setVoice(vid, vid === id);
    }
    for (const [vid, ui] of voiceUis) ui.soloBtn.classList.toggle('current', soloed === vid);
  }

  function buildVoicesAndGrid(): void {
    voicesHost.innerHTML = '';
    voiceUis.clear();
    if (!engine || !track) return;

    for (const def of track.voices) {
      const card = el('div', 'voice active', voicesHost);
      card.style.setProperty('--voice-color', def.color);

      const head = el('div', 'voice-head', card);
      const light = el('span', 'light', head);
      el('span', 'voice-name', head, def.name);

      const toggleWrap = el('label', 'row', card, 'in the mix');
      const toggle = el('input', '', toggleWrap) as HTMLInputElement;
      toggle.type = 'checkbox';
      toggle.checked = true;
      toggle.onchange = () => setVoice(def.id, toggle.checked, false);

      const volWrap = el('label', 'row', card, 'volume');
      const vol = el('input', '', volWrap) as HTMLInputElement;
      vol.type = 'range';
      vol.min = '0';
      vol.max = '100';
      vol.value = '100';
      vol.oninput = () => engine!.setVoiceVolume(def.id, Number(vol.value) / 100);

      const tools = el('div', 'tools', card);
      const hitBtn = el('button', 'small', tools, 'hit') as HTMLButtonElement;
      hitBtn.onclick = () => engine!.preview(def.id);
      const soloBtn = el('button', 'small', tools, 'solo') as HTMLButtonElement;
      soloBtn.onclick = () => toggleSolo(def.id);

      voiceUis.set(def.id, { card, light, toggle, soloBtn });
    }
    renderGrid();
  }

  function renderGrid(): void {
    gridHost.innerHTML = '';
    gridSections.clear();
    if (!engine || !track) return;
    const section = track.sections.find((s) => s.id === engine!.sectionId)!;
    const phraseSteps = track.bars * STEPS_PER_BAR;

    for (const def of track.voices) {
      const voice = engine.voices.get(def.id)!;
      const sec = el('div', 'pg-section', gridHost);
      sec.style.setProperty('--voice-color', def.color);
      if (voice.enabled) sec.classList.add('active');

      const head = el('div', 'pg-head', sec);
      el('span', 'pg-mix pg-mix-static', head, '●');
      el('span', 'pg-name', head, def.name);

      const body = el('div', 'pg-body', sec);
      const playhead = el('div', 'pg-playhead', body);
      const cellsByRowStep = new Map<string, HTMLElement>();

      const chart: LabChart | undefined = section.charts[def.id];
      const rows = rowsFor(def, track, voice.samples);
      const chartSteps = chart ? chart.bars * STEPS_PER_BAR : 0;
      for (const row of rows) {
        const rowEl = el('div', 'pg-row', body);
        el('span', 'pg-row-label', rowEl, row.label);
        const cells = el('div', 'pg-cells', rowEl);
        for (let step = 0; step < phraseSteps; step++) {
          const cell = el('button', 'pg-cell', cells) as HTMLButtonElement;
          cell.disabled = true;
          if (step % STEPS_PER_BAR === 0) cell.classList.add('bar-start');
          else if (step % 4 === 0) cell.classList.add('beat-start');
          if (chart) {
            const srcStep = step % chartSteps;
            const ev = chart.events.find((e) => {
              if (e.step !== srcStep) return false;
              if (row.variant !== undefined) return (e.variant ?? voice.defaultVariant) === row.variant;
              return (e.note ?? 0) === row.note;
            });
            if (ev) {
              cell.classList.add('hit');
              cell.style.setProperty('--vel', String(ev.velocity));
              if (step >= chartSteps) cell.classList.add('ghost');
              if (def.pitched && voice.samples.size > 1 && ev.variant && ev.variant !== voice.defaultVariant) {
                cell.textContent = ev.variant[0];
              }
            }
          }
          cellsByRowStep.set(`${row.key}|${step}`, cell);
        }
      }
      gridSections.set(def.id, { body, playhead, cellsByRowStep });
    }
  }

  // ---- hotkeys: space play/stop, digits toggle voices ----
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement && e.target.type !== 'range') return;
    if (e.code === 'Space') {
      e.preventDefault();
      if (engine) setPlaying(!engine.clock.running);
    }
    if (track) {
      const idx = Number(e.key) - 1;
      if (idx >= 0 && idx < track.voices.length) {
        const id = track.voices[idx].id;
        setVoice(id, !engine!.voices.get(id)!.enabled);
      }
    }
  });

  // ---- frame loop ----
  function frame(): void {
    if (engine) {
      const wasRunning = engine.clock.running;
      engine.update();
      const running = engine.clock.running;
      const phraseStep = running ? engine.currentStep() : -1;
      for (const sct of gridSections.values()) {
        sct.playhead.classList.toggle('hidden', !running);
        if (running) sct.playhead.style.setProperty('--step', String(phraseStep));
      }
      if (running && track) {
        const beatNo = Math.floor((phraseStep % STEPS_PER_BAR) / 4) + 1;
        const arrangement = engine.arrangementPosition();
        if (arrangement) {
          const sectionName = track.sections.find((s) => s.id === arrangement.sectionId)?.name;
          position.textContent =
            `arrangement bar ${arrangement.bar}/${arrangement.totalBars} · beat ${beatNo}` +
            (sectionName ? ` · ${sectionName}` : '');
        } else {
          const barNo = Math.floor(phraseStep / STEPS_PER_BAR) + 1;
          position.textContent = `bar ${barNo}/${track.bars} · beat ${beatNo}`;
        }
      }
      if (wasRunning && !running) position.textContent = '—';
      syncTransport();
    }
    if (root.isConnected) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // Console handle for probing: loop.tracklab.engine, .load('pursuit')
  const w = window as unknown as { loop?: Record<string, unknown> };
  if (w.loop) {
    w.loop.tracklab = {
      get engine() {
        return engine;
      },
      tracks: TRACKS,
      load: (id: string) => {
        const t = TRACKS.find((x) => x.id === id);
        if (t) void loadTrack(t);
      },
    };
  }

  // Auto-load the first featured/full-arrangement study when one exists.
  if (displayTracks.length > 0) void loadTrack(displayTracks[0]);
}
