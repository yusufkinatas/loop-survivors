import { MusicEngine } from '../audio/engine';
import type { Kit, Role } from '../audio/kits';
import {
  applyFixtureValues,
  cloneFixture,
  DEFAULT_FIXTURE,
  parseFixture,
  serializeFixture,
  type DevFixture,
} from './fixture';
import { DisposeBag, isTypingTarget } from './lifecycle';
import { DEFAULT_ROOM, DEV_ROOMS, findRoom } from './registry';
import { mountRoomAdapter } from './room-adapters';
import {
  roomPath,
  type DevRoomDefinition,
  type DevRoomKind,
  type DevRoomSession,
} from './types';

const PRIMARY_KINDS: readonly { kind: DevRoomKind; label: string }[] = [
  { kind: 'gym', label: 'Gyms' },
  { kind: 'zoo', label: 'Zoos' },
  { kind: 'museum', label: 'Museums' },
];

interface ParsedRoute {
  room: DevRoomDefinition;
  fixture: DevFixture;
}

function parseRoute(hash: string): ParsedRoute {
  const [path, query = ''] = hash.replace(/^#/, '').split('?');
  const parts = path.split('/');
  const kind = parts[1] as DevRoomKind | undefined;
  const slug = parts[2];
  const room = (kind && slug ? findRoom(kind, slug) : undefined) ?? DEFAULT_ROOM;
  const fallback = applyFixtureValues({
    ...DEFAULT_FIXTURE,
    preset: room.presets[0]?.id ?? DEFAULT_FIXTURE.preset,
    values: {},
  }, room.presets[0]?.values);
  return { room, fixture: parseFixture(query, fallback) };
}

function option(tag: HTMLSelectElement, value: string, label: string): void {
  const node = document.createElement('option');
  node.value = value;
  node.textContent = label;
  tag.appendChild(node);
}

function button(parent: HTMLElement, text: string, className = ''): HTMLButtonElement {
  const node = document.createElement('button');
  node.className = `dev-button ${className}`.trim();
  node.textContent = text;
  parent.appendChild(node);
  return node;
}

/** Mount the persistent campus shell. Room navigation is serialized: the old
 * session is fully disposed before the next receives a DOM root or engine. */
export async function mountDevCampus(
  root: HTMLElement,
  audioContext: AudioContext,
  kits: Map<Role, Kit>,
): Promise<{ dispose(): Promise<void> }> {
  root.replaceChildren();
  root.classList.add('dev-campus-root');
  const bag = new DisposeBag();
  document.documentElement.classList.add('dev-campus-page');
  document.body.classList.add('dev-campus-page');
  bag.add(() => {
    document.documentElement.classList.remove('dev-campus-page');
    document.body.classList.remove('dev-campus-page');
  });
  let activeSession: DevRoomSession | null = null;
  let activeRoomRoot: HTMLElement | null = null;
  let activeRoom = DEFAULT_ROOM;
  let activeFixture = cloneFixture(DEFAULT_FIXTURE);
  let initialFixture = cloneFixture(DEFAULT_FIXTURE);
  let generation = 0;
  let navigation = Promise.resolve();

  const shell = document.createElement('div');
  shell.className = 'dev-campus';
  root.appendChild(shell);

  const sidebar = document.createElement('aside');
  sidebar.className = 'dev-sidebar';
  shell.appendChild(sidebar);
  const brand = document.createElement('div');
  brand.className = 'dev-brand';
  brand.innerHTML = '<strong>DEV CAMPUS</strong><span>production systems, isolated</span>';
  sidebar.appendChild(brand);

  const game = button(sidebar, '← Game', 'dev-game-link');
  game.onclick = () => {
    location.hash = '';
  };

  const search = document.createElement('input');
  search.className = 'dev-search';
  search.type = 'search';
  search.placeholder = 'Search rooms  ⌘K';
  search.setAttribute('aria-label', 'Search Dev Campus rooms');
  sidebar.appendChild(search);

  const tabs = document.createElement('div');
  tabs.className = 'dev-tabs';
  sidebar.appendChild(tabs);
  let selectedKind: DevRoomKind = 'gym';
  const tabButtons = new Map<DevRoomKind, HTMLButtonElement>();
  for (const item of [...PRIMARY_KINDS, { kind: 'archive' as const, label: 'Archive' }]) {
    const tab = button(tabs, item.label, item.kind === 'archive' ? 'dev-archive-tab' : '');
    tab.onclick = () => {
      selectedKind = item.kind;
      renderRoomList();
    };
    tabButtons.set(item.kind, tab);
  }

  const roomList = document.createElement('nav');
  roomList.className = 'dev-room-list';
  roomList.setAttribute('aria-label', 'Dev Campus rooms');
  sidebar.appendChild(roomList);

  const main = document.createElement('main');
  main.className = 'dev-main';
  shell.appendChild(main);
  const heading = document.createElement('header');
  heading.className = 'dev-room-heading';
  main.appendChild(heading);
  const crumb = document.createElement('div');
  crumb.className = 'dev-breadcrumb';
  const title = document.createElement('h1');
  const purpose = document.createElement('p');
  purpose.className = 'dev-purpose';
  heading.append(crumb, title, purpose);
  const headingActions = document.createElement('div');
  headingActions.className = 'dev-heading-actions';
  const prev = button(headingActions, '← Previous');
  const next = button(headingActions, 'Next →');
  const issueLink = document.createElement('a');
  issueLink.className = 'dev-issue-link';
  issueLink.target = '_blank';
  issueLink.rel = 'noreferrer';
  headingActions.appendChild(issueLink);
  heading.appendChild(headingActions);

  const statusBanner = document.createElement('div');
  statusBanner.className = 'dev-status-banner';
  main.appendChild(statusBanner);

  const toolbar = document.createElement('div');
  toolbar.className = 'dev-toolbar';
  main.appendChild(toolbar);
  const preset = document.createElement('select');
  preset.className = 'dev-select';
  preset.setAttribute('aria-label', 'Scenario preset');
  const seed = document.createElement('input');
  seed.className = 'dev-seed';
  seed.type = 'number';
  seed.min = '0';
  seed.max = String(0xffffffff);
  seed.setAttribute('aria-label', 'Scenario seed');
  const reset = button(toolbar, 'Reset  R');
  const reroll = button(toolbar, 'Reroll');
  const play = button(toolbar, 'Pause  Space');
  const step = button(toolbar, 'Step  .');
  const slower = button(toolbar, '− speed  [');
  const speed = document.createElement('span');
  speed.className = 'dev-speed-readout';
  const faster = button(toolbar, '+ speed  ]');
  const audio = button(toolbar, 'Audio');
  const overlays = button(toolbar, 'Overlays');
  const copy = button(toolbar, 'Copy link');
  const presetWrap = document.createElement('label');
  presetWrap.className = 'dev-tool-field';
  presetWrap.append('preset ', preset);
  const seedWrap = document.createElement('label');
  seedWrap.className = 'dev-tool-field';
  seedWrap.append('seed ', seed);
  toolbar.prepend(presetWrap, seedWrap);

  const roomHost = document.createElement('section');
  roomHost.className = 'dev-room-host';
  main.appendChild(roomHost);

  const liveRegion = document.createElement('div');
  liveRegion.className = 'dev-live-region';
  liveRegion.setAttribute('aria-live', 'polite');
  main.appendChild(liveRegion);

  function roomSearchText(room: DevRoomDefinition): string {
    return [room.title, room.purpose, room.status, ...room.systems, ...room.keywords].join(' ').toLowerCase();
  }

  function renderRoomList(): void {
    const query = search.value.trim().toLowerCase();
    roomList.replaceChildren();
    for (const [kind, tab] of tabButtons) tab.classList.toggle('active', kind === selectedKind);
    const matches = DEV_ROOMS.filter(
      (room) => room.kind === selectedKind && (!query || roomSearchText(room).includes(query)),
    );
    for (const room of matches) {
      const link = document.createElement('a');
      link.href = roomPath(room);
      link.className = 'dev-room-link';
      link.classList.toggle('active', room.issue === activeRoom.issue);
      const badge = document.createElement('span');
      badge.className = `dev-status status-${room.status.toLowerCase()}`;
      badge.textContent = room.status;
      const label = document.createElement('span');
      label.textContent = room.title;
      const issue = document.createElement('small');
      issue.textContent = `#${room.issue}`;
      link.append(badge, label, issue);
      roomList.appendChild(link);
    }
    if (matches.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'dev-empty';
      empty.textContent = 'No rooms match this search.';
      roomList.appendChild(empty);
    }
  }

  function setUrl(room: DevRoomDefinition, fixture: DevFixture, replace = true): void {
    const url = `${roomPath(room)}?${serializeFixture(fixture)}`;
    if (replace) history.replaceState(null, '', url);
    else location.hash = url.slice(1);
  }

  function paintToolbar(): void {
    const caps = activeSession?.capabilities ?? {};
    preset.value = activeFixture.preset;
    seed.value = String(activeFixture.seed >>> 0);
    play.style.display = caps.play ? '' : 'none';
    step.style.display = caps.step ? '' : 'none';
    slower.style.display = caps.speed ? '' : 'none';
    speed.style.display = caps.speed ? '' : 'none';
    faster.style.display = caps.speed ? '' : 'none';
    audio.style.display = caps.audio ? '' : 'none';
    overlays.style.display = caps.overlays ? '' : 'none';
    reroll.style.display = caps.reroll ? '' : 'none';
    play.textContent = activeFixture.playing ? 'Pause  Space' : 'Play  Space';
    speed.textContent = `${activeFixture.speed.toFixed(2)}×`;
    audio.classList.toggle('active', activeFixture.audio);
    overlays.classList.toggle('active', activeFixture.overlays);
  }

  function activePeers(): DevRoomDefinition[] {
    return DEV_ROOMS.filter((room) => room.kind === activeRoom.kind);
  }

  function paintHeading(): void {
    selectedKind = activeRoom.kind;
    crumb.textContent = `${activeRoom.kind.toUpperCase()} / #${activeRoom.issue}`;
    title.textContent = activeRoom.title;
    purpose.textContent = activeRoom.purpose;
    issueLink.href = `https://github.com/yusufkinatas/loop-survivors/issues/${activeRoom.issue}`;
    issueLink.textContent = `Open issue #${activeRoom.issue} ↗`;
    statusBanner.className = `dev-status-banner status-${activeRoom.status.toLowerCase()}`;
    statusBanner.replaceChildren();
    const badge = document.createElement('strong');
    badge.textContent = activeRoom.status;
    const note = document.createElement('span');
    note.textContent = activeRoom.statusNote ?? (
      activeRoom.status === 'CURRENT'
        ? 'Production-backed developer surface. Automation can expose regressions; only you can pass a hands, ear, or eye gate.'
        : 'This room is separated from current production truth.'
    );
    statusBanner.append(badge, note);
    const peers = activePeers();
    const index = peers.findIndex((room) => room.issue === activeRoom.issue);
    prev.disabled = index <= 0;
    next.disabled = index < 0 || index >= peers.length - 1;
    prev.onclick = () => index > 0 && (location.hash = roomPath(peers[index - 1]).slice(1));
    next.onclick = () => index < peers.length - 1 && (location.hash = roomPath(peers[index + 1]).slice(1));
    preset.replaceChildren();
    for (const item of activeRoom.presets) option(preset, item.id, item.label);
    renderRoomList();
  }

  async function disposeActive(): Promise<void> {
    const session = activeSession;
    activeSession = null;
    if (session) await session.dispose();
    activeRoomRoot?.remove();
    activeRoomRoot = null;
  }

  async function mountActive(room: DevRoomDefinition, fixture: DevFixture): Promise<void> {
    const myGeneration = ++generation;
    await disposeActive();
    if (myGeneration !== generation) return;
    activeRoom = room;
    activeFixture = cloneFixture(fixture);
    initialFixture = cloneFixture(fixture);
    paintHeading();
    roomHost.replaceChildren();
    const loading = document.createElement('div');
    loading.className = 'dev-loading';
    loading.textContent = 'Mounting isolated room…';
    roomHost.appendChild(loading);
    const mountRoot = document.createElement('div');
    mountRoot.className = 'dev-room-session';
    try {
      const session = await mountRoomAdapter({
        root: mountRoot,
        audioContext,
        kits,
        fixture: cloneFixture(fixture),
        room,
        createEngine: () => new MusicEngine(audioContext, kits),
        navigate(target, partial = {}) {
          const nextFixture = { ...DEFAULT_FIXTURE, ...partial, values: partial.values ?? {} };
          setUrl(target, nextFixture, false);
        },
      });
      if (myGeneration !== generation) {
        await session.dispose();
        return;
      }
      loading.remove();
      roomHost.appendChild(mountRoot);
      activeRoomRoot = mountRoot;
      activeSession = session;
      paintToolbar();
      liveRegion.textContent = `${room.title} ready`;
    } catch (error) {
      mountRoot.remove();
      loading.className = 'dev-room-error';
      loading.textContent = error instanceof Error ? error.message : String(error);
      liveRegion.textContent = `${room.title} failed to mount`;
      throw error;
    }
  }

  function queueRoute(route = parseRoute(location.hash)): void {
    navigation = navigation
      .then(() => mountActive(route.room, route.fixture))
      .catch((error) => console.error('Dev Campus navigation failed', error));
  }

  function remount(fixture: DevFixture, updateUrl = true): void {
    if (updateUrl) setUrl(activeRoom, fixture);
    queueRoute({ room: activeRoom, fixture });
  }

  preset.onchange = () => {
    const selected = activeRoom.presets.find((item) => item.id === preset.value);
    remount(applyFixtureValues({
      ...activeFixture,
      preset: preset.value,
      values: {},
    }, selected?.values));
  };
  seed.onchange = () => remount({ ...activeFixture, seed: Math.trunc(Number(seed.value)) >>> 0 });
  reset.onclick = () => remount(cloneFixture(initialFixture));
  reroll.onclick = () => {
    if (activeSession?.reroll) {
      activeSession.reroll();
      activeFixture = activeSession.serialize();
      setUrl(activeRoom, activeFixture);
    } else {
      remount({ ...activeFixture, seed: (activeFixture.seed + 1) >>> 0 });
    }
  };
  play.onclick = () => {
    activeFixture.playing = !activeFixture.playing;
    activeSession?.setPlaying?.(activeFixture.playing);
    setUrl(activeRoom, activeFixture);
    paintToolbar();
  };
  step.onclick = () => activeSession?.step?.();
  const nudgeSpeed = (direction: number) => {
    activeFixture.speed = Math.max(0.25, Math.min(10, activeFixture.speed + direction * 0.25));
    activeSession?.setSpeed?.(activeFixture.speed);
    setUrl(activeRoom, activeFixture);
    paintToolbar();
  };
  slower.onclick = () => nudgeSpeed(-1);
  faster.onclick = () => nudgeSpeed(1);
  audio.onclick = () => {
    activeFixture.audio = !activeFixture.audio;
    activeSession?.setAudio?.(activeFixture.audio);
    setUrl(activeRoom, activeFixture);
    paintToolbar();
  };
  overlays.onclick = () => {
    activeFixture.overlays = !activeFixture.overlays;
    activeSession?.setOverlays?.(activeFixture.overlays);
    setUrl(activeRoom, activeFixture);
    paintToolbar();
  };
  copy.onclick = async () => {
    activeFixture = activeSession?.serialize() ?? activeFixture;
    setUrl(activeRoom, activeFixture);
    await navigator.clipboard.writeText(location.href);
    copy.textContent = 'Copied';
    window.setTimeout(() => (copy.textContent = 'Copy link'), 1000);
  };

  search.oninput = renderRoomList;
  bag.listen(window, 'hashchange', () => {
    if (location.hash.startsWith('#dev')) queueRoute();
  });
  bag.listen(window, 'keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      search.focus();
      search.select();
      return;
    }
    if (isTypingTarget(event.target)) return;
    if (event.code === 'KeyR') {
      event.preventDefault();
      reset.click();
    } else if (event.code === 'Space' && activeSession?.capabilities.play) {
      event.preventDefault();
      play.click();
    } else if (event.code === 'Period' && activeSession?.capabilities.step) {
      event.preventDefault();
      step.click();
    } else if (event.code === 'BracketLeft' && activeSession?.capabilities.speed) {
      nudgeSpeed(-1);
    } else if (event.code === 'BracketRight' && activeSession?.capabilities.speed) {
      nudgeSpeed(1);
    }
  });

  if (location.hash === '#dev' || location.hash === '#dev/') {
    const fixture = applyFixtureValues({
      ...DEFAULT_FIXTURE,
      preset: DEFAULT_ROOM.presets[0]?.id ?? 'default',
      values: {},
    }, DEFAULT_ROOM.presets[0]?.values);
    setUrl(DEFAULT_ROOM, fixture);
  }
  renderRoomList();
  queueRoute();

  return {
    async dispose(): Promise<void> {
      generation++;
      await navigation;
      await disposeActive();
      await bag.dispose();
      root.classList.remove('dev-campus-root');
      root.replaceChildren();
    },
  };
}
