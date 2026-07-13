import { MusicEngine } from '../audio/engine';
import type { Kit, Role } from '../audio/kits';
import { isTypingTarget, type DisposableSession } from '../lifecycle';
import { compatibilityRoom, fixtureForRoom, mountRoomContent, type MountedRoomContent } from './content';
import { DEV_ROOMS, findRoom, roomPath, type DevRoomDef, type RoomKind } from './rooms';

export interface CampusDeps {
  ctx: AudioContext;
  kits: Map<Role, Kit>;
}

interface Route {
  kind?: RoomKind;
  slug?: string;
  params: URLSearchParams;
}

interface LifecycleStats {
  roomMounts: number;
  roomDisposals: number;
  hardResets: number;
  activeRooms: number;
}

const KINDS: RoomKind[] = ['gym', 'zoo', 'museum', 'archive'];

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  parent: HTMLElement,
  text = '',
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  parent.appendChild(node);
  return node;
}

function parseRoute(hash = location.hash): Route {
  const [path, query = ''] = hash.split('?');
  const parts = path.split('/').filter(Boolean);
  return {
    kind: KINDS.includes(parts[1] as RoomKind) ? (parts[1] as RoomKind) : undefined,
    slug: parts[2],
    params: new URLSearchParams(query),
  };
}

function routeRoom(route: Route): DevRoomDef | undefined {
  return route.kind && route.slug ? findRoom(route.kind, route.slug) : undefined;
}

function writeRoute(room: DevRoomDef, params: URLSearchParams, replace = false): void {
  const query = params.toString();
  const next = `${roomPath(room)}${query ? `?${query}` : ''}`;
  if (replace) history.replaceState(null, '', next);
  else location.hash = next.slice(1);
}

function statusBadge(parent: HTMLElement, status: string): HTMLElement {
  return el('span', `dev-status status-${status.toLowerCase()}`, parent, status);
}

function makeButton(parent: HTMLElement, text: string, fn: () => void, className = 'small'): HTMLButtonElement {
  const button = el('button', className, parent, text);
  button.onclick = () => {
    fn();
    button.blur();
  };
  return button;
}

export async function mountDevCampus(root: HTMLElement, deps: CampusDeps): Promise<DisposableSession> {
  root.replaceChildren();
  root.classList.add('dev-campus-root');
  const shell = el('div', 'dev-campus', root);
  const top = el('header', 'dev-campus-top', shell);
  const brand = el('button', 'dev-brand', top, 'Loop Survivors · Dev Campus');
  brand.onclick = () => { location.hash = 'dev'; };
  const lifecycle = el('span', 'dev-lifecycle', top, 'lifecycle clean');
  const search = el('input', 'dev-search', top) as HTMLInputElement;
  search.type = 'search';
  search.placeholder = 'Search rooms, systems, status…  ⌘K';
  search.setAttribute('aria-label', 'Search Dev Campus rooms');
  const exit = makeButton(top, '← game', () => { location.hash = ''; });
  exit.classList.add('dev-exit');

  const tabs = el('nav', 'dev-tabs', shell);
  const tabButtons = new Map<RoomKind, HTMLButtonElement>();
  for (const kind of KINDS) {
    const b = makeButton(tabs, kind === 'archive' ? 'Archive' : `${kind[0].toUpperCase()}${kind.slice(1)}s`, () => {
      location.hash = `dev/${kind}`;
    }, 'dev-tab');
    tabButtons.set(kind, b);
  }

  const main = el('div', 'dev-campus-main', shell);
  const sidebar = el('aside', 'dev-sidebar', main);
  const sideHead = el('div', 'dev-sidebar-head', sidebar);
  const sideTitle = el('strong', '', sideHead, 'All rooms');
  const roomList = el('div', 'dev-room-list', sidebar);
  const workspace = el('main', 'dev-workspace', main);
  const breadcrumb = el('div', 'dev-breadcrumb', workspace);
  const controls = el('div', 'dev-controls', workspace);
  const roomHost = el('div', 'dev-room-host', workspace);

  const stats: LifecycleStats = { roomMounts: 0, roomDisposals: 0, hardResets: 0, activeRooms: 0 };
  let mounted: MountedRoomContent | null = null;
  let disposed = false;
  let navigationGeneration = 0;
  let navigationQueue = Promise.resolve();
  let currentRoom: DevRoomDef | null = null;
  let initialSnapshot = '';
  let lastResetEquivalent: boolean | null = null;

  const consoleHandle = window as unknown as { loop?: Record<string, unknown> };
  if (consoleHandle.loop) {
    consoleHandle.loop.campus = {
      stats,
      rooms: DEV_ROOMS,
      get room() { return currentRoom; },
      get snapshot() { return mounted?.snapshot() ?? ''; },
    };
  }

  const paintLifecycle = (): void => {
    const clean = stats.activeRooms <= 1 && stats.roomMounts - stats.roomDisposals === stats.activeRooms;
    lifecycle.textContent = clean
      ? `lifecycle clean · ${stats.activeRooms} active`
      : `LIFECYCLE LEAK · ${stats.activeRooms} active`;
    lifecycle.classList.toggle('bad', !clean);
    if (!clean) throw new Error('Dev Campus lifecycle invariant failed');
  };

  const disposeRoom = async (): Promise<void> => {
    if (!mounted) return;
    const old = mounted;
    mounted = null;
    await old.dispose();
    stats.roomDisposals++;
    stats.activeRooms--;
    paintLifecycle();
  };

  const navigate = (hash: string): void => {
    if (hash === '#') location.hash = '';
    else location.hash = hash.startsWith('#') ? hash.slice(1) : hash;
  };

  const updateFixture = (patch: Record<string, unknown>): void => {
    if (!currentRoom) return;
    const route = parseRoute();
    const params = route.params;
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined || value === null || value === false) params.delete(key);
      else {
        const param = key === 'muted' ? 'audio' : key === 'paused' ? 'play' : key;
        const encoded = key === 'muted' ? (value ? 'off' : 'on') : key === 'paused' ? (value ? 'paused' : 'playing') : String(value);
        params.set(param, encoded);
      }
    }
    writeRoute(currentRoom, params, true);
    queueRoute(false);
  };

  function renderSidebar(route: Route): void {
    roomList.replaceChildren();
    const query = search.value.trim().toLowerCase();
    const activeKind = route.kind;
    sideTitle.textContent = query ? 'Search results' : activeKind ? `${activeKind === 'archive' ? 'Archive' : `${activeKind}s`}` : 'All rooms';
    for (const room of DEV_ROOMS) {
      const haystack = [room.title, room.summary, room.status, room.kind, room.slug, ...room.tags].join(' ').toLowerCase();
      if (query && !haystack.includes(query)) continue;
      if (!query && activeKind && room.kind !== activeKind) continue;
      const card = el('button', `dev-room-nav${currentRoom === room ? ' current' : ''}`, roomList);
      const title = el('span', 'dev-room-nav-title', card, room.title);
      el('small', '', title, `#${room.issue}`);
      statusBadge(card, room.status);
      card.onclick = () => navigate(roomPath(room));
    }
    if (roomList.childElementCount === 0) el('p', 'dev-empty', roomList, 'No rooms match that search.');
  }

  function renderHub(route: Route): void {
    controls.replaceChildren();
    breadcrumb.replaceChildren();
    el('span', '', breadcrumb, 'Dev Campus');
    roomHost.replaceChildren();
    const hero = el('section', 'dev-hub-hero', roomHost);
    el('div', 'dev-eyebrow', hero, route.kind ? route.kind : 'in-game developer documentation');
    el('h1', '', hero, route.kind ? `${route.kind === 'archive' ? 'Archive' : `${route.kind[0].toUpperCase()}${route.kind.slice(1)}s`}` : 'Test, inspect, and understand the real game');
    el('p', '', hero, 'Gyms operate and stress mechanics. Zoos compare complete content families. Museums teach production systems through live examples. The Archive preserves experiments without presenting them as current truth.');
    const groups = route.kind ? [route.kind] : KINDS;
    for (const kind of groups) {
      const section = el('section', 'dev-hub-section', roomHost);
      el('h2', '', section, kind === 'archive' ? 'Archive' : `${kind[0].toUpperCase()}${kind.slice(1)}s`);
      const grid = el('div', 'dev-hub-grid', section);
      for (const room of DEV_ROOMS.filter((entry) => entry.kind === kind)) {
        const card = el('button', 'dev-hub-card', grid);
        const topRow = el('span', 'dev-card-title', card);
        el('strong', '', topRow, room.title);
        statusBadge(topRow, room.status);
        el('span', '', card, room.summary);
        el('small', '', card, `Issue #${room.issue} · ${room.presets.length} preset${room.presets.length === 1 ? '' : 's'}`);
        card.onclick = () => navigate(roomPath(room));
      }
    }
  }

  function buildControls(room: DevRoomDef, route: Route): void {
    controls.replaceChildren();
    const fixture = fixtureForRoom(room, route.params);

    const presetWrap = el('label', 'dev-control', controls);
    el('span', '', presetWrap, 'preset');
    const preset = el('select', '', presetWrap);
    for (const id of room.presets) {
      const option = document.createElement('option');
      option.value = id;
      option.textContent = id.replaceAll('-', ' ');
      option.selected = id === fixture.preset;
      preset.appendChild(option);
    }
    preset.onchange = () => {
      route.params.set('preset', preset.value);
      writeRoute(room, route.params);
    };

    if (room.controls.seed) {
      const seedWrap = el('label', 'dev-control', controls);
      el('span', '', seedWrap, 'seed');
      const seed = el('input', 'dev-seed', seedWrap) as HTMLInputElement;
      seed.type = 'number';
      seed.value = String(fixture.seed);
      seed.onchange = () => {
        route.params.set('seed', String(Number(seed.value) || 27));
        writeRoute(room, route.params);
      };
      makeButton(controls, '↻ reroll', () => {
        route.params.set('seed', String(fixture.seed + 1));
        writeRoute(room, route.params);
      });
    }

    makeButton(controls, 'R · hard reset', () => {
      stats.hardResets++;
      lastResetEquivalent = null;
      queueRoute(true);
    });

    if (room.controls.play) {
      const play = makeButton(controls, fixture.paused ? '▶ play' : 'Ⅱ pause', () => {
        const scenario = mounted?.scenario;
        if (!scenario) return;
        const next = scenario.isPlaying();
        scenario.setPlaying(!next);
        route.params.set('play', next ? 'paused' : 'playing');
        writeRoute(room, route.params, true);
        play.textContent = next ? '▶ play' : 'Ⅱ pause';
      });
      if (room.controls.step) {
        const step = makeButton(controls, '. · one tick', () => mounted?.scenario?.step());
        step.title = 'Advances exactly one fixed simulation tick while paused; it does not advance live audio.';
      }
    }

    if (room.controls.speed) {
      const speedWrap = el('label', 'dev-control dev-speed', controls);
      const readout = el('span', '', speedWrap, `${(fixture.speed ?? 1).toFixed(2)}×`);
      const speed = el('input', '', speedWrap) as HTMLInputElement;
      speed.type = 'range';
      speed.min = '0.25';
      speed.max = '3';
      speed.step = '0.25';
      speed.value = String(fixture.speed ?? 1);
      speed.oninput = () => {
        const value = Number(speed.value);
        mounted?.scenario?.setSpeed(value);
        readout.textContent = `${value.toFixed(2)}×`;
        route.params.set('speed', String(value));
        writeRoute(room, route.params, true);
      };
    }

    if (room.controls.audio) {
      const audio = makeButton(controls, fixture.muted ? 'audio off' : 'audio on', () => {
        fixture.muted = !fixture.muted;
        mounted?.scenario?.setMuted(!!fixture.muted);
        route.params.set('audio', fixture.muted ? 'off' : 'on');
        writeRoute(room, route.params, true);
        audio.textContent = fixture.muted ? 'audio off' : 'audio on';
        audio.classList.toggle('on', !fixture.muted);
      });
      audio.classList.toggle('on', !fixture.muted);
    }

    if (room.controls.overlays) {
      const overlays = makeButton(controls, fixture.overlays ? 'overlays on' : 'overlays off', () => {
        fixture.overlays = !fixture.overlays;
        mounted?.scenario?.setOverlays(!!fixture.overlays);
        route.params.set('overlays', fixture.overlays ? 'on' : 'off');
        writeRoute(room, route.params, true);
        overlays.textContent = fixture.overlays ? 'overlays on' : 'overlays off';
      });
    }

    const copied = makeButton(controls, 'copy link', () => {
      void navigator.clipboard.writeText(location.href).then(() => {
        copied.textContent = 'copied';
        window.setTimeout(() => { copied.textContent = 'copy link'; }, 900);
      });
    });
    copied.title = 'Copies room, preset, seed, and every supported shared control.';

    const health = el('span', 'dev-reset-health', controls);
    health.textContent = lastResetEquivalent === null ? 'reset reconstructs fixture' : lastResetEquivalent ? 'reset byte-equivalent' : 'reset mismatch';
    health.classList.toggle('bad', lastResetEquivalent === false);
  }

  async function mountRoute(forceReset: boolean): Promise<void> {
    const generation = ++navigationGeneration;
    roomHost.scrollTop = 0;
    const compat = compatibilityRoom(location.hash);
    if (compat) {
      history.replaceState(null, '', compat);
    }
    const route = parseRoute();
    const room = routeRoom(route);
    await disposeRoom();
    if (disposed || generation !== navigationGeneration) return;
    currentRoom = room ?? null;
    for (const [kind, button] of tabButtons) button.classList.toggle('current', route.kind === kind);
    renderSidebar(route);
    if (!room) {
      renderHub(route);
      return;
    }

    const allInKind = DEV_ROOMS.filter((entry) => entry.kind === room.kind);
    const index = allInKind.indexOf(room);
    breadcrumb.replaceChildren();
    const hub = el('button', 'dev-crumb', breadcrumb, 'Dev Campus');
    hub.onclick = () => navigate('#dev');
    el('span', '', breadcrumb, '/');
    const kind = el('button', 'dev-crumb', breadcrumb, room.kind);
    kind.onclick = () => navigate(`#dev/${room.kind}`);
    el('span', '', breadcrumb, '/');
    el('span', '', breadcrumb, room.title);
    const paging = el('span', 'dev-room-paging', breadcrumb);
    const prev = makeButton(paging, '←', () => navigate(roomPath(allInKind[(index - 1 + allInKind.length) % allInKind.length])));
    prev.title = 'Previous room';
    const next = makeButton(paging, '→', () => navigate(roomPath(allInKind[(index + 1) % allInKind.length])));
    next.title = 'Next room';

    buildControls(room, route);
    const fixture = fixtureForRoom(room, route.params);
    const createEngine = (): MusicEngine => new MusicEngine(deps.ctx, deps.kits);
    mounted = await mountRoomContent(roomHost, room, fixture, {
      ...deps,
      createEngine,
      navigate,
      updateFixture,
    });
    if (disposed || generation !== navigationGeneration) {
      await mounted.dispose();
      mounted = null;
      return;
    }
    stats.roomMounts++;
    stats.activeRooms++;
    paintLifecycle();
    const snapshot = mounted.snapshot();
    if (forceReset) lastResetEquivalent = snapshot === initialSnapshot;
    else initialSnapshot = snapshot;
    buildControls(room, parseRoute());
    renderSidebar(parseRoute());
  }

  function queueRoute(forceReset: boolean): void {
    navigationQueue = navigationQueue.then(() => mountRoute(forceReset)).catch((error) => {
      roomHost.replaceChildren();
      const box = el('div', 'dev-callout error', roomHost);
      el('strong', '', box, 'Room failed to mount');
      el('pre', '', box, error instanceof Error ? error.stack ?? error.message : String(error));
      console.error(error);
    });
  }

  const onHashChange = (): void => {
    if (location.hash.startsWith('#dev') || compatibilityRoom(location.hash)) queueRoute(false);
  };
  window.addEventListener('hashchange', onHashChange);

  search.oninput = () => renderSidebar(parseRoute());
  search.onkeydown = (event) => {
    if (event.code === 'Escape') {
      search.value = '';
      renderSidebar(parseRoute());
      search.blur();
    } else if (event.code === 'Enter') {
      const first = roomList.querySelector<HTMLButtonElement>('.dev-room-nav');
      first?.click();
    }
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if ((event.metaKey || event.ctrlKey) && event.code === 'KeyK') {
      event.preventDefault();
      search.focus();
      search.select();
      return;
    }
    if (isTypingTarget(event.target)) return;
    if (event.code === 'KeyR' && currentRoom) {
      event.preventDefault();
      stats.hardResets++;
      queueRoute(true);
    } else if (event.code === 'Space' && mounted?.scenario) {
      event.preventDefault();
      const route = parseRoute();
      const wasPlaying = mounted.scenario.isPlaying();
      mounted.scenario.setPlaying(!wasPlaying);
      route.params.set('play', wasPlaying ? 'paused' : 'playing');
      writeRoute(currentRoom!, route.params, true);
      buildControls(currentRoom!, route);
    } else if (event.code === 'Period' && mounted?.scenario) {
      event.preventDefault();
      mounted.scenario.step();
    } else if ((event.code === 'BracketLeft' || event.code === 'BracketRight') && mounted?.scenario) {
      const route = parseRoute();
      const speed = Math.max(0.25, Math.min(3, Number(route.params.get('speed') ?? 1) + (event.code === 'BracketRight' ? 0.25 : -0.25)));
      route.params.set('speed', String(speed));
      writeRoute(currentRoom!, route.params, true);
      mounted.scenario.setSpeed(speed);
      buildControls(currentRoom!, route);
    }
  };
  window.addEventListener('keydown', onKeyDown);

  paintLifecycle();
  queueRoute(false);

  return {
    async dispose(): Promise<void> {
      if (disposed) return;
      disposed = true;
      navigationGeneration++;
      window.removeEventListener('hashchange', onHashChange);
      window.removeEventListener('keydown', onKeyDown);
      await navigationQueue;
      await disposeRoom();
      const handle = (window as unknown as { loop?: Record<string, unknown> }).loop;
      if (handle) delete handle.campus;
      root.classList.remove('dev-campus-root');
      root.replaceChildren();
    },
  };
}
