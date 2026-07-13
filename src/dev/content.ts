import { getChart, isEdited } from '../audio/chartstore';
import { PRODUCTION_SAMPLE_MANIFEST } from '../audio/kits/index';
import { ROLE_META, type Kit, type Role } from '../audio/kits';
import { SOUNDSET } from '../audio/soundset';
import { BOSSES } from '../boss/bosses';
import { RUN, LEVELUP, type EnemyKind } from '../game/config';
import { SLOTS, SLOT_LABEL, supportedRoster } from '../game/band';
import { inspectPickPool, rollOffers } from '../game/picks';
import { mulberry32 } from '../game/rng';
import { mountBossFight } from '../boss/page';
import { mountRehearsalRoom } from '../rehearsal/room';
import { mountTrackLab } from '../tracklab/lab';
import { TRACKS } from '../tracklab/tracks';
import type { DisposableSession } from '../lifecycle';
import {
  ACTIVE_ENEMIES,
  ACTIVE_WEAPONS,
  AUDIO_CATALOG,
  ENEMY_CATALOG,
  FX_CATALOG,
  INTERACTION_CATALOG,
  SOURCE_STATIONS,
  STAGE_CATALOG,
  SYSTEM_STATUS,
  UI_STATE_CATALOG,
  enemyCatalogStats,
} from './catalog';
import { defaultFixture, mountScenario, type ScenarioDeps, type ScenarioFixture, type ScenarioSession } from './scenario';
import { DEV_ROOMS, roomPath, type DevRoomDef } from './rooms';

export interface RoomContentDeps extends ScenarioDeps {
  ctx: AudioContext;
  kits: Map<Role, Kit>;
  updateFixture(patch: Partial<ScenarioFixture>): void;
  navigate(path: string): void;
}

export interface MountedRoomContent extends DisposableSession {
  scenario?: ScenarioSession;
  snapshot(): string;
}

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

function statusBadge(parent: HTMLElement, status: string): HTMLElement {
  return el('span', `dev-status status-${status.toLowerCase()}`, parent, status);
}

function sourceLink(parent: HTMLElement, file: string, label = file): HTMLAnchorElement {
  const a = el('a', 'dev-source-link', parent, label);
  a.href = `https://github.com/yusufkinatas/loop-survivors/blob/main/${file}`;
  a.target = '_blank';
  a.rel = 'noreferrer';
  return a;
}

function roomLink(parent: HTMLElement, label: string, path: string, deps: RoomContentDeps): HTMLButtonElement {
  const b = el('button', 'small dev-room-link', parent, label);
  b.onclick = () => deps.navigate(`#dev/${path}`);
  return b;
}

function table(parent: HTMLElement, headers: string[], rows: Array<Array<string | number | HTMLElement>>): HTMLTableElement {
  const t = el('table', 'dev-table', parent);
  const head = el('thead', '', t);
  const hr = el('tr', '', head);
  for (const header of headers) el('th', '', hr, header);
  const body = el('tbody', '', t);
  for (const row of rows) {
    const tr = el('tr', '', body);
    for (const cell of row) {
      const td = el('td', '', tr);
      if (cell instanceof HTMLElement) td.appendChild(cell);
      else td.textContent = String(cell);
    }
  }
  return t;
}

function fmt(value: number | undefined): string {
  if (value === undefined) return '—';
  if (!Number.isFinite(value)) return '∞';
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function roomHeader(root: HTMLElement, room: DevRoomDef): HTMLElement {
  const head = el('header', 'dev-room-head', root);
  const eyebrow = el('div', 'dev-eyebrow', head, `${room.kind} · issue #${room.issue}`);
  statusBadge(eyebrow, room.status);
  el('h1', '', head, room.title);
  el('p', 'dev-room-summary', head, room.summary);
  const links = el('div', 'dev-inline-links', head);
  const issue = el('a', '', links, `GitHub issue #${room.issue}`);
  issue.href = `https://github.com/yusufkinatas/loop-survivors/issues/${room.issue}`;
  issue.target = '_blank';
  issue.rel = 'noreferrer';
  return head;
}

function selector<T extends string | number>(
  parent: HTMLElement,
  label: string,
  value: T,
  options: Array<{ value: T; label: string }>,
  onChange: (value: T) => void,
): HTMLSelectElement {
  const wrap = el('label', 'dev-field', parent);
  el('span', '', wrap, label);
  const select = el('select', '', wrap);
  for (const option of options) {
    const o = document.createElement('option');
    o.value = String(option.value);
    o.textContent = option.label;
    o.selected = option.value === value;
    select.appendChild(o);
  }
  select.onchange = () => onChange(select.value as T);
  return select;
}

function staticSession(root: HTMLElement): MountedRoomContent {
  return {
    snapshot: () => root.textContent ?? '',
    dispose: () => root.replaceChildren(),
  };
}

async function mountSimulationRoom(
  root: HTMLElement,
  room: DevRoomDef,
  fixture: ScenarioFixture,
  deps: RoomContentDeps,
): Promise<MountedRoomContent> {
  const tools = el('div', 'dev-room-tools', root);
  if (['weapons', 'kick', 'sync', 'archetypes', 'causality'].includes(room.slug)) {
    selector(
      tools,
      'weapon',
      fixture.role ?? (room.slug === 'kick' ? 'kick' : 'kick'),
      ACTIVE_WEAPONS.map((entry) => ({ value: entry.role, label: `${entry.slotLabel} · ${entry.name}` })),
      (role) => deps.updateFixture({ role }),
    );
    selector(
      tools,
      'tier',
      fixture.tier ?? 1,
      [1, 2, 3, 4].map((tier) => ({ value: tier, label: `Tier ${tier}` })),
      (tier) => deps.updateFixture({ tier: Number(tier) }),
    );
  }
  if (['enemies', 'movement', 'weapons'].includes(room.slug)) {
    selector(
      tools,
      'target',
      fixture.enemy ?? 'zombie',
      ACTIVE_ENEMIES.map((kind) => ({ value: kind, label: ENEMY_CATALOG.find((e) => e.kind === kind)!.label })),
      (enemy) => deps.updateFixture({ enemy: enemy as EnemyKind }),
    );
    selector(
      tools,
      'player level',
      fixture.level ?? 1,
      [1, 5, 10, 20, 40].map((level) => ({ value: level, label: String(level) })),
      (level) => deps.updateFixture({ level: Number(level) }),
    );
  }

  if (room.slug === 'parity-run') {
    const note = el('div', 'dev-callout current', root);
    el('strong', '', note, 'Developer hands gate — observation only');
    el('p', '', note, 'Judge movement/contact, density and timed events, Kick facing/area/damage, other weapon areas, enemy readability, and kill satisfaction. This room never marks the gate passed.');
    const launch = el('button', 'big', note, 'Launch the exact production run shell');
    launch.onclick = () => deps.navigate('#');
  }

  const simRoot = el('div', 'dev-sim-host', root);
  const scenario = await mountScenario(simRoot, room, fixture, deps);
  return {
    scenario,
    snapshot: () => scenario.snapshot(),
    async dispose() {
      await scenario.dispose();
      root.replaceChildren();
    },
  };
}

function mountWeaponCatalog(root: HTMLElement, room: DevRoomDef, fixture: ScenarioFixture, deps: RoomContentDeps): MountedRoomContent {
  const cards = el('div', 'dev-card-grid weapons', root);
  const showPatterns = room.slug === 'patterns';
  for (const entry of ACTIVE_WEAPONS) {
    const card = el('article', 'dev-card weapon-card', cards);
    card.style.setProperty('--specimen-color', entry.color);
    const top = el('div', 'dev-card-title', card);
    el('span', 'dev-token-dot', top);
    el('strong', '', top, entry.name);
    el('span', 'dev-muted-label', top, entry.slotLabel);
    const tiers = el('div', 'dev-tier-grid', card);
    for (let tier = 1; tier <= 4; tier++) {
      const conf = entry.tiers[tier - 1];
      const chart = getChart(entry.role, tier);
      const t = el('button', 'dev-tier-card', tiers);
      t.title = 'Open this exact production weapon/tier in the Weapon Gym';
      el('b', '', t, `${tier}`);
      if (showPatterns) {
        el('span', '', t, `${chart.events.length} events / ${chart.bars} bar${chart.bars === 1 ? '' : 's'}`);
        el('span', 'dev-mini-pattern', t, chart.events.map((event) => event.step).join(' · ') || 'silent');
      } else {
        el('span', '', t, entry.tierLines[tier - 1]);
        el('span', '', t, `dmg ${fmt(conf.damage)} · area ${fmt(conf.radius ?? conf.area)}`);
      }
      if (isEdited(entry.role, tier)) statusBadge(t, 'EXPERIMENTAL');
      t.onclick = () => deps.navigate(`#dev/gym/weapons?preset=single&seed=${fixture.seed}&role=${entry.role}&tier=${tier}`);
    }
  }
  el('p', 'dev-footnote', root, `${ACTIVE_WEAPONS.length} active weapons × 4 tiers. Crash and riser are absent because the registry marks them audio-only.`);
  return staticSession(root);
}

function mountEnemyCatalog(root: HTMLElement, room: DevRoomDef, fixture: ScenarioFixture, deps: RoomContentDeps): MountedRoomContent {
  const historical = room.slug === 'legacy-enemies';
  const entries = ENEMY_CATALOG.filter((entry) => historical ? entry.status === 'HISTORICAL' : entry.status === 'CURRENT');
  const toolbar = el('div', 'dev-room-tools', root);
  const level = fixture.level ?? 1;
  selector(toolbar, 'player level', level, [1, 5, 10, 20, 40].map((v) => ({ value: v, label: String(v) })), (v) => deps.updateFixture({ level: Number(v) }));
  if (historical) {
    const banner = el('div', 'dev-callout historical', root, 'Archive boundary: these eight enemies are not part of the current Mad Forest stage and cannot be launched into a current stage preset.');
    statusBadge(banner, 'HISTORICAL');
  }
  const cards = el('div', 'dev-card-grid enemies', root);
  for (const entry of entries) {
    const stats = enemyCatalogStats(entry.kind, level);
    const card = el('article', 'dev-card enemy-card', cards);
    card.style.setProperty('--enemy-color', `#${stats.color.toString(16).padStart(6, '0')}`);
    const body = el('div', 'dev-enemy-body', card);
    const size = Math.max(14, Math.min(74, stats.radius * 2));
    body.style.width = `${size}px`;
    body.style.height = `${size}px`;
    el('strong', '', card, entry.label);
    const meta = el('div', 'dev-card-meta', card);
    statusBadge(meta, entry.status);
    el('span', '', meta, entry.category);
    table(card, ['HP', 'damage', 'speed', 'XP', 'radius', 'knockback'], [[fmt(stats.hp), fmt(stats.damage), fmt(stats.speed), fmt(stats.xp), fmt(stats.radius), fmt(stats.knockback)]]);
    if (!historical) {
      const open = el('button', 'small', card, 'open behavior fixture');
      open.onclick = () => deps.navigate(`#dev/gym/enemies?preset=pursuit&seed=${fixture.seed}&enemy=${entry.kind}&level=${level}`);
    }
  }
  return staticSession(root);
}

function mountPickGym(root: HTMLElement, fixture: ScenarioFixture): MountedRoomContent {
  const band = new Map<Role, number>();
  const encoded = new URLSearchParams(location.hash.split('?')[1] ?? '').get('build');
  if (encoded) {
    for (const token of encoded.split(',')) {
      const [role, tier] = token.split(':') as [Role, string];
      if (ACTIVE_WEAPONS.some((entry) => entry.role === role)) band.set(role, Math.max(1, Math.min(4, Number(tier))));
    }
  }
  const persistBand = (): void => {
    const value = [...band].map(([role, tier]) => `${role}:${tier}`).join(',');
    const hash = location.hash;
    const [path, query = ''] = hash.split('?');
    const params = new URLSearchParams(query);
    if (value) params.set('build', value);
    else params.delete('build');
    history.replaceState(null, '', `${path}?${params}`);
  };
  const editor = el('div', 'dev-band-editor', root);
  for (const slot of SLOTS) {
    const field = el('label', 'dev-field', editor);
    el('span', '', field, SLOT_LABEL[slot]);
    const select = el('select', '', field);
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = 'empty';
    select.appendChild(empty);
    for (const role of supportedRoster(slot)) {
      for (let tier = 1; tier <= 4; tier++) {
        const option = document.createElement('option');
        option.value = `${role}:${tier}`;
        option.textContent = `${ROLE_META[role].name} · tier ${tier}`;
        option.selected = band.get(role) === tier;
        select.appendChild(option);
      }
    }
    select.onchange = () => {
      for (const role of supportedRoster(slot)) band.delete(role);
      if (select.value) {
        const [role, tier] = select.value.split(':') as [Role, string];
        band.set(role, Number(tier));
      }
      persistBand();
      renderReport();
    };
  }
  const actions = el('div', 'dev-inline-actions', root);
  const one = el('button', 'small', actions, 'roll one offer');
  const many = el('button', 'small', actions, 'roll 10,000');
  const report = el('div', 'dev-pick-report', root);

  const renderReport = (trials = 1): void => {
    report.replaceChildren();
    const diagnostics = inspectPickPool(band, fixture.preset.includes('late') ? 180 : 30);
    const rng = mulberry32(fixture.seed);
    const counts = new Map<Role, number>();
    let last = [] as ReturnType<typeof rollOffers>;
    for (let i = 0; i < trials; i++) {
      last = rollOffers(band, rng, fixture.preset.includes('late') ? 180 : 30);
      for (const option of last) counts.set(option.role, (counts.get(option.role) ?? 0) + 1);
    }
    const offered = el('div', 'dev-callout current', report);
    el('strong', '', offered, trials === 1 ? `Seeded cards: ${last.map((option) => `${ROLE_META[option.role].name} ${option.tier}`).join(' · ') || '+15 HP fallback'}` : `${trials.toLocaleString()} descriptive trials`);
    table(report, ['role', 'slot', 'tier', 'weight', 'status/reason', trials > 1 ? 'offer share' : 'offered'], diagnostics.map((d) => [ROLE_META[d.role].name, SLOT_LABEL[d.slot], d.tier ?? 'new', d.weight, d.reason, trials > 1 ? `${(((counts.get(d.role) ?? 0) / trials) * 100).toFixed(1)}%` : last.some((o) => o.role === d.role) ? 'yes' : '—']));
    el('p', 'dev-footnote', report, 'Distribution is diagnostic only. It never decides whether the balance feels right.');
  };
  one.onclick = () => renderReport(1);
  many.onclick = () => renderReport(10_000);
  renderReport();
  return staticSession(root);
}

function mountStageCatalog(root: HTMLElement, fixture: ScenarioFixture, deps: RoomContentDeps): MountedRoomContent {
  const banner = el('div', 'dev-callout current', root);
  el('strong', '', banner, `Locked run boundary ${Math.floor(STAGE_CATALOG.boundaryS / 60)}:00`);
  el('span', '', banner, ` · ${STAGE_CATALOG.startingSpawns} starting bodies · the 8:00 wave is documented, never moved earlier.`);
  const rows: Array<Array<string | number | HTMLElement>> = [];
  for (const wave of STAGE_CATALOG.waves) {
    const go = document.createElement('button');
    go.className = 'small';
    go.textContent = 'open fixture';
    go.onclick = () => deps.navigate(`#dev/gym/stage?preset=${Math.floor(wave.atS / 60)}:00&seed=${fixture.seed}`);
    rows.push([`${Math.floor(wave.atS / 60)}:00`, wave.pattern.join(' + '), wave.minimum, wave.intervalS, go]);
  }
  table(root, ['time', 'regular pattern', 'minimum alive', 'interval (s)', 'live'], rows);
  table(root, ['time', 'event', 'details'], STAGE_CATALOG.events.map((event) => [event.atS, event.type, JSON.stringify(event)]));
  return staticSession(root);
}

function mountAudioCatalog(root: HTMLElement, room: DevRoomDef, deps: RoomContentDeps): MountedRoomContent {
  const engine = deps.createEngine();
  const dormantOnly = room.slug === 'dormant-audio';
  const manifest = PRODUCTION_SAMPLE_MANIFEST;
  const cards = el('div', 'dev-card-grid sounds', root);
  for (const entry of AUDIO_CATALOG.filter((entry) => dormantOnly ? entry.status === 'DORMANT' : true)) {
    const card = el('article', 'dev-card sound-card', cards);
    card.style.setProperty('--specimen-color', entry.color);
    const title = el('div', 'dev-card-title', card);
    el('span', 'dev-token-dot', title);
    el('strong', '', title, entry.name);
    statusBadge(title, entry.status);
    el('p', '', card, `${entry.pitched ? 'pitched voice — the same sound can play higher or lower' : 'one-shot sound'} · variants: ${entry.variants.join(', ')}`);
    const files = manifest[entry.role];
    el('p', 'dev-footnote', card, files ? `sample-backed: ${files.map(([, file]) => `${file}.wav`).join(', ')}` : 'synthesized in production with a built-in fallback');
    const hit = el('button', 'small', card, 'audition one hit');
    hit.onclick = () => {
      void engine.ctx.resume();
      engine.preview(entry.role);
    };
    if (entry.status === 'DORMANT') el('p', 'dev-warning', card, 'Audio only. This room has no path that enables it as a weapon.');
  }
  return {
    snapshot: () => root.textContent ?? '',
    dispose: () => {
      engine.dispose();
      root.replaceChildren();
    },
  };
}

function mountCatalogRoom(root: HTMLElement, room: DevRoomDef, deps: RoomContentDeps): MountedRoomContent {
  switch (room.slug) {
    case 'dormant-audio':
    case 'sounds':
      return mountAudioCatalog(root, room, deps);
    case 'vfx': {
      const cards = el('div', 'dev-card-grid', root);
      for (const fx of FX_CATALOG) {
        const card = el('article', `dev-card fx-specimen fx-${fx.replace(/\W+/g, '-')}`, cards);
        el('div', 'fx-demo', card);
        el('strong', '', card, fx);
        el('span', 'dev-footnote', card, fx.includes('death') || fx.includes('damage') ? 'bounded production family with a stress preset' : 'current production family');
      }
      return staticSession(root);
    }
    case 'pickups': {
      const ranges = INTERACTION_CATALOG.pickups;
      const compare = el('div', 'dev-radius-compare', root);
      for (const [name, value] of Object.entries(ranges)) {
        const specimen = el('div', 'dev-radius-specimen', compare);
        const circle = el('div', 'dev-radius-circle', specimen);
        circle.style.width = `${Math.max(20, Math.min(240, value))}px`;
        circle.style.height = circle.style.width;
        el('strong', '', specimen, `${name}: ${value}`);
      }
      const glyphs = el('div', 'dev-card-grid weapons', root);
      for (const weapon of ACTIVE_WEAPONS) {
        const card = el('article', 'dev-card weapon-card', glyphs);
        card.style.setProperty('--specimen-color', weapon.color);
        el('span', 'dev-token-glyph', card, weapon.role.slice(0, 2).toUpperCase());
        el('strong', '', card, weapon.name);
        el('span', '', card, 'new: 1 · tier-up: 2 → 3');
      }
      return staticSession(root);
    }
    case 'ui-states':
    case 'ui': {
      const grid = el('div', 'dev-card-grid', root);
      for (const state of UI_STATE_CATALOG) {
        const card = el('article', 'dev-card ui-specimen', grid);
        el('strong', '', card, state);
        const related = state.includes('boss') ? 'gym/boss-fights' : state.includes('Scratch') ? 'gym/scratch' : state.includes('replay') ? 'gym/determinism' : 'gym/parity-run';
        roomLink(card, 'open real surface', related, deps);
      }
      return staticSession(root);
    }
    case 'tokens':
    case 'accessibility':
    case 'devices': {
      const tokens = el('div', 'dev-token-board', root);
      for (const weapon of ACTIVE_WEAPONS) {
        const token = el('div', 'dev-token', tokens, `${weapon.slotLabel} · ${weapon.name}`);
        token.style.setProperty('--specimen-color', weapon.color);
      }
      for (const enemy of ENEMY_CATALOG.filter((entry) => entry.status === 'CURRENT')) {
        const stats = enemyCatalogStats(enemy.kind, 1);
        const token = el('div', 'dev-token enemy', tokens, enemy.label);
        token.style.setProperty('--specimen-color', `#${stats.color.toString(16).padStart(6, '0')}`);
      }
      const sizes = el('div', 'dev-device-row', root);
      for (const [name, width, height] of [['desktop', 1280, 720], ['tablet', 1024, 768], ['phone', 390, 844]] as const) {
        const box = el('div', 'dev-device', sizes, `${name}\n${width}×${height}`);
        box.style.aspectRatio = `${width}/${height}`;
      }
      el('p', 'dev-footnote', root, 'Low-motion and contrast controls are diagnostic view filters only; future player-facing settings remain unspecified.');
      return staticSession(root);
    }
    default:
      return staticSession(root);
  }
}

const MUSEUM_COPY: Record<string, { title: string; steps: string[]; note: string; links: string[] }> = {
  causality: { title: 'The central contract', steps: ['Timing-pattern event', 'MusicEngine schedules and voices it', 'One due trigger', 'Sound output + RunWorld.fireTrigger gameplay attack'], note: 'Muting changes only the sound volume. It does not disable the trigger or damage. A separate random gameplay trigger is the forbidden counterexample.', links: ['gym/sync', 'gym/weapons'] },
  clock: { title: 'How the repeating clock groups time', steps: ['Step — the smallest timing square', 'Beat — four steps; the pulse you can count', 'Bar — four beats; one short repeating measure', 'Phrase — four bars; the whole timing pattern before it repeats'], note: `Tempo is ${SOUNDSET.bpm} beats per minute. Swing means alternating in-between hits are pushed slightly late so the rhythm feels less rigid; shipped swing is ${SOUNDSET.swing}.`, links: ['gym/music', 'gym/sync'] },
  scheduling: { title: 'Scheduled early, applied when heard', steps: ['Lookahead queues near-future audio', 'Scheduled timestamp stays attached to the event', 'MusicEngine.update drains events whose time has arrived', 'Tier/world actions at the same heard time run before that trigger'], note: 'Applying the new damage when audio is merely scheduled would make an older sound silently deal new-tier damage. That is the labeled bad example.', links: ['gym/sync', 'museum/causality'] },
  'audio-path': { title: 'Production signal path', steps: ['Voice sample or synth', 'Per-voice volume / slot mute', 'Weapons group', 'Master volume', 'Limiter and output meter'], note: 'The level-up cue bypasses the weapons group, so it remains clear while the weapon mix briefly dips. The kick briefly makes room for the low instrument.', links: ['zoo/mix', 'gym/music'] },
  band: { title: 'Permanent seven-position band', steps: SLOTS.map((slot) => `${SLOT_LABEL[slot]} — ${supportedRoster(slot).map((role) => ROLE_META[role].name).join(' or ')}`), note: 'Hiring one choice permanently closes its rival in that position. Tier IV leaves the pool. A complete maxed build falls back to +15 HP.', links: ['gym/picks', 'zoo/weapons'] },
  archetypes: { title: 'One trigger branches into many bodies', steps: ['Facing strips and close cone', 'Straight, homing, and returning projectiles', 'Orbiting projectiles and lobs that shatter', 'Slow, pull, trail, and mine fields'], note: 'Area, travel speed, lifetime, piercing, repeat-hit locks, event strength, and target choice all come from production config and RunWorld.', links: ['gym/weapons', 'zoo/weapon-bodies'] },
  progression: { title: 'Reward lifecycle', steps: ['Kill', 'XP gem drops', 'Magnet then collect', 'XP threshold', 'Three offers queued', 'Ground choices appear', 'Walk onto one', 'Apply at the next heard bar'], note: `Ground choices use a fixed ${LEVELUP.itemPickupRadius}-unit collection radius, not the ${RUN.magnetRadius}-unit gem magnet.`, links: ['gym/rewards', 'gym/picks'] },
  collision: { title: 'Horde collision at scale', steps: ['Enemies enter spatial-hash cells', 'Nearby cells form the broad candidate set', 'Circle overlap is the exact check', 'Separation, contact lock, knockback, and recycling update production state'], note: `The player radius is ${RUN.playerRadius.toFixed(1)} and contact can damage again after ${RUN.iframesS * 1000} ms.`, links: ['gym/movement', 'gym/enemies', 'zoo/enemies'] },
  reference: { title: 'Evidence labels are not interchangeable', steps: ['CURRENT — current commercial data', 'LEGACY — old official demo evidence', 'DERIVED — math calculated from evidence', 'ADOPTED — project value chosen from evidence', 'INFERENCE — a reasoned estimate'], note: 'The campus never merges current commercial values and the old demo into one supposedly authoritative source.', links: ['gym/stage', 'zoo/enemies'] },
  time: { title: 'Separate owners, fixed simulation ticks', steps: ['Developer speed', '× reward-moment slowdown', '= effective clock and step payout rate', 'Every simulation update still uses the same fixed SIM_DT', 'Replay speed remains a separate replay-only control'], note: `The reward moment uses ${LEVELUP.slowScale}× for up to ${LEVELUP.momentS} second. Larger variable simulation deltas are never used.`, links: ['gym/sync', 'gym/determinism'] },
  determinism: { title: 'The same world in browser, bot, and replay', steps: ['Seeded random number stream', 'Fixed simulation tick', 'Deterministic trigonometry', 'Production RunWorld', 'Virtual conductor for headless timing', 'Exact replay from seed + policies'], note: 'The bot detects regressions and balance floors. It never passes a hands, eye, or ear gate.', links: ['gym/determinism', 'gym/bot'] },
  'world-view': { title: 'Authority and presentation', steps: ['RunWorld — authoritative simulation', 'RunView — Pixi presentation of that world', 'FX queue — optional cosmetic requests', 'Game shell — physical ground-choice presentation', 'Headless bot — the same world without view or FX'], note: 'Turning off rendering or cosmetic FX must not change simulation outcomes.', links: ['gym/stress', 'gym/vfx'] },
  performance: { title: 'Bounded horde budgets', steps: [`Regular population soft cap ${300}`, `Absolute alive cap ${500}`, `Gem cap ${RUN.maxGems}`, 'View culling and shared shapes', 'Bounded death bursts and damage numbers', 'Fixed-step debt is shown separately'], note: 'Simulation, rendering, and audio costs are separate counters so a visual effect cannot masquerade as simulation cost.', links: ['gym/stress'] },
};

async function mountMuseum(root: HTMLElement, room: DevRoomDef, fixture: ScenarioFixture, deps: RoomContentDeps): Promise<MountedRoomContent> {
  if (room.slug === 'stage') return mountStageCatalog(root, fixture, deps);
  if (room.slug === 'status') {
    table(root, ['system', 'status'], SYSTEM_STATUS.map((entry) => {
      const badge = document.createElement('span');
      badge.className = `dev-status status-${entry.status.toLowerCase()}`;
      badge.textContent = entry.status;
      return [entry.name, badge];
    }));
    const archive = el('div', 'dev-inline-actions', root);
    roomLink(archive, 'Open Track Lab archive', 'archive/track-lab', deps);
    return staticSession(root);
  }
  if (room.slug === 'source') {
    table(root, ['system', 'runtime source', 'live room'], SOURCE_STATIONS.map((station) => {
      const source = document.createElement('span');
      sourceLink(source, station.file);
      const live = document.createElement('button');
      live.className = 'small';
      live.textContent = 'open';
      live.onclick = () => deps.navigate(`#dev/${station.room}`);
      return [station.system, source, live];
    }));
    el('p', 'dev-warning', root, 'Runtime registries lead. Specs explain locked intent; STATUS records current state; historical prose may describe systems that were later removed.');
    return staticSession(root);
  }
  if (room.slug === 'audio-provenance') {
    table(root, ['role', 'use', 'source/processing', 'license'], AUDIO_CATALOG.map((entry) => {
      const samples = PRODUCTION_SAMPLE_MANIFEST[entry.role];
      return [entry.name, entry.status, samples ? samples.map(([, f]) => `${f}.wav`).join(', ') : 'synthesized at runtime', samples ? 'See public/samples/house/CREDITS.md — verify before ship' : 'code-generated'];
    }));
    sourceLink(root, 'public/samples/house/CREDITS.md', 'Open production sample credits');
    el('p', 'dev-warning', root, 'Unknown or ambiguous licensing must be resolved before store preparation; presence in the build is not license approval.');
    return staticSession(root);
  }

  const copy = MUSEUM_COPY[room.slug];
  if (copy) {
    const exhibit = el('section', 'dev-exhibit', root);
    el('h2', '', exhibit, copy.title);
    const flow = el('div', 'dev-flow', exhibit);
    copy.steps.forEach((step, i) => {
      el('div', 'dev-flow-node', flow, step);
      if (i < copy.steps.length - 1) el('span', 'dev-flow-arrow', flow, '→');
    });
    el('p', 'dev-callout current', exhibit, copy.note);
    const links = el('div', 'dev-inline-actions', exhibit);
    for (const link of copy.links) {
      const target = DEV_ROOMS.find((candidate) => `${candidate.kind}/${candidate.slug}` === link);
      if (target) roomLink(links, target.title, link, deps);
    }
  }

  if (['causality', 'archetypes', 'collision', 'time', 'determinism', 'world-view', 'performance'].includes(room.slug)) {
    return mountSimulationRoom(root, room, fixture, deps);
  }
  return staticSession(root);
}

export async function mountRoomContent(
  root: HTMLElement,
  room: DevRoomDef,
  fixture: ScenarioFixture,
  deps: RoomContentDeps,
): Promise<MountedRoomContent> {
  root.replaceChildren();
  roomHeader(root, room);
  if (room.status === 'EXPERIMENTAL') {
    const banner = el('div', 'dev-callout experimental', root, 'EXPERIMENTAL — this area is standalone and does not imply integration into the normal run.');
    statusBadge(banner, 'EXPERIMENTAL');
  } else if (room.status === 'DORMANT' || room.status === 'HISTORICAL') {
    const banner = el('div', `dev-callout ${room.status.toLowerCase()}`, root, `${room.status} — preserved for inspection, not current game truth.`);
    statusBadge(banner, room.status);
  } else if (room.status === 'PARKED') {
    const banner = el('div', 'dev-callout parked', root, 'PARKED — this requires a future locked phase specification. No fake mechanics are mounted here.');
    statusBadge(banner, 'PARKED');
  }
  const body = el('div', 'dev-room-body', root);

  if (room.renderer === 'parked') {
    if (room.issue === 54) sourceLink(body, 'docs/plan.md', 'Prerequisite: locked M4 first-time-experience specification');
    else sourceLink(body, 'docs/plan.md', 'Prerequisite: the relevant future locked phase specification');
    return staticSession(root);
  }
  if (room.renderer === 'music') {
    const engine = deps.createEngine();
    const session = mountRehearsalRoom(body, engine);
    return {
      snapshot: () => body.textContent ?? '',
      dispose: async () => {
        await session.dispose();
        engine.dispose();
        root.replaceChildren();
      },
    };
  }
  if (room.renderer === 'tracklab') {
    const archive = el('div', 'dev-callout historical', body);
    el('strong', '', archive, 'Research—not current game source of truth');
    el('p', '', archive, `${TRACKS.map((track) => track.title).join(', ')} are retained cover experiments. Their full-track/drop direction was superseded by build-made music.`);
    const session = mountTrackLab(body, deps.ctx);
    return { snapshot: () => body.textContent ?? '', dispose: async () => { await session.dispose(); root.replaceChildren(); } };
  }
  if (room.renderer === 'boss') {
    if (room.kind === 'zoo') {
      const cards = el('div', 'dev-card-grid', body);
      for (const boss of BOSSES) {
        const card = el('article', 'dev-card boss-specimen', cards);
        card.style.setProperty('--specimen-color', `#${boss.palette.boss.toString(16).padStart(6, '0')}`);
        el('strong', '', card, boss.name);
        el('span', '', card, boss.archetype);
        el('p', '', card, boss.tagline);
        statusBadge(card, 'EXPERIMENTAL');
      }
      roomLink(body, 'Open playable boss prototypes', 'gym/boss-fights', deps);
      return staticSession(root);
    }
    const session = await mountBossFight(body, deps.ctx);
    return { snapshot: () => body.textContent ?? '', dispose: async () => { await session.dispose(); root.replaceChildren(); } };
  }
  if (room.renderer === 'weapons' && room.kind === 'zoo') return mountWeaponCatalog(body, room, fixture, deps);
  if (room.renderer === 'enemies' && room.kind === 'zoo') return mountEnemyCatalog(body, room, fixture, deps);
  if (room.renderer === 'picks') return mountPickGym(body, fixture);
  if (room.renderer === 'stage' && room.kind !== 'gym') return mountStageCatalog(body, fixture, deps);
  if (room.renderer === 'catalog') return mountCatalogRoom(body, room, deps);
  if (room.renderer === 'museum') return mountMuseum(body, room, fixture, deps);
  return mountSimulationRoom(body, room, fixture, deps);
}

export function fixtureForRoom(room: DevRoomDef, params: URLSearchParams): ScenarioFixture {
  const preset = room.presets.includes(params.get('preset') ?? '') ? params.get('preset')! : room.presets[0];
  const seed = Number(params.get('seed') ?? 27) || 27;
  const fixture = defaultFixture(room, preset, seed);
  const role = params.get('role') as Role | null;
  const enemy = params.get('enemy') as EnemyKind | null;
  if (role && ACTIVE_WEAPONS.some((entry) => entry.role === role)) fixture.role = role;
  if (enemy && ACTIVE_ENEMIES.includes(enemy as never)) fixture.enemy = enemy;
  if (params.has('tier')) fixture.tier = Math.max(1, Math.min(4, Number(params.get('tier')) || 1));
  if (params.has('level')) fixture.level = Math.max(1, Number(params.get('level')) || 1);
  if (params.has('speed')) fixture.speed = Math.max(0.25, Math.min(10, Number(params.get('speed')) || 1));
  fixture.muted = params.get('audio') === 'off';
  fixture.overlays = params.get('overlays') !== 'off';
  fixture.paused = params.get('play') === 'paused';
  return fixture;
}

export function compatibilityRoom(hash: string): string | null {
  if (hash === '#rehearsal') return roomPath(DEV_ROOMS.find((room) => room.issue === 39)!);
  if (hash === '#tracklab') return roomPath(DEV_ROOMS.find((room) => room.issue === 69)!);
  if (hash === '#boss') return roomPath(DEV_ROOMS.find((room) => room.issue === 52)!);
  return null;
}
