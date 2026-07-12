import { RoomHost } from './lifecycle';
import { fixtureFromUrl } from './scenario';
import { registeredRooms, roomFromHash, roomPath, type DevContext, type RoomKind } from './registry';

const KINDS: readonly RoomKind[] = ['gym', 'zoo', 'museum', 'archive'];

export async function mountDevCampus(root: HTMLElement, context: DevContext): Promise<() => Promise<void>> {
  root.replaceChildren();
  root.classList.add('dev-campus');
  const shell = document.createElement('div');
  shell.className = 'dev-shell';
  shell.innerHTML = `
    <aside class="dev-sidebar">
      <a class="dev-home" href="#dev">Dev Campus</a>
      <div class="dev-tabs"></div>
      <input class="dev-search" type="search" placeholder="Search rooms…" aria-label="Search rooms">
      <nav class="dev-room-list" aria-label="Developer rooms"></nav>
    </aside>
    <main class="dev-main"><header class="dev-breadcrumbs"></header><section class="dev-room"></section></main>`;
  root.appendChild(shell);

  const tabs = shell.querySelector('.dev-tabs') as HTMLElement;
  const list = shell.querySelector('.dev-room-list') as HTMLElement;
  const search = shell.querySelector('.dev-search') as HTMLInputElement;
  const crumbs = shell.querySelector('.dev-breadcrumbs') as HTMLElement;
  const roomRoot = shell.querySelector('.dev-room') as HTMLElement;
  const host = new RoomHost(roomRoot);
  let selectedKind: RoomKind | 'all' = 'all';

  for (const kind of KINDS) {
    const button = document.createElement('button');
    button.textContent = kind === 'archive' ? 'Archive' : `${kind[0].toUpperCase()}${kind.slice(1)}s`;
    button.onclick = () => {
      selectedKind = selectedKind === kind ? 'all' : kind;
      renderList();
    };
    tabs.appendChild(button);
  }

  function renderList(): void {
    const query = search.value.trim().toLowerCase();
    list.replaceChildren();
    for (const room of registeredRooms()) {
      if (selectedKind !== 'all' && room.kind !== selectedKind) continue;
      const haystack = [room.title, room.description, room.status, ...room.tags].join(' ').toLowerCase();
      if (query && !haystack.includes(query)) continue;
      const link = document.createElement('a');
      link.href = roomPath(room);
      link.innerHTML = `<span>${room.title}</span><small class="dev-status ${room.status.toLowerCase()}">${room.status}</small>`;
      list.appendChild(link);
    }
  }

  async function navigate(): Promise<void> {
    const registration = roomFromHash(location.hash);
    if (!registration) {
      await host.dispose();
      crumbs.textContent = 'Dev Campus';
      roomRoot.innerHTML = '<div class="dev-welcome"><h1>Dev Campus</h1><p>Choose a Gym to operate a mechanic, a Zoo to inspect a catalog, or a Museum to learn a production system from live examples.</p></div>';
      return;
    }
    const room = registration.create(context);
    crumbs.innerHTML = `<a href="#dev">Dev Campus</a> / ${registration.kind} / ${registration.title} <small class="dev-status ${registration.status.toLowerCase()}">${registration.status}</small>`;
    await host.mount(room, fixtureFromUrl(room.defaultFixture));
  }

  const onHash = () => void navigate();
  const onKey = (event: KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      search.focus();
    }
  };
  search.addEventListener('input', renderList);
  window.addEventListener('hashchange', onHash);
  window.addEventListener('keydown', onKey);
  renderList();
  await navigate();

  return async () => {
    window.removeEventListener('hashchange', onHash);
    window.removeEventListener('keydown', onKey);
    await host.dispose();
    root.classList.remove('dev-campus');
    shell.remove();
  };
}
