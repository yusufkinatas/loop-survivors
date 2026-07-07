// The sandbox (M2 spec, developer tools): the real game arena with the
// stage script switched off. Enemies are watched, weapons tested, and
// balance gates run under reproducible conditions here. The rehearsal room
// is for listening; the sandbox is for watching and testing.

import type { MusicEngine } from '../audio/engine';
import type { Genre, GenreId } from '../audio/genres';
import { supportedRoles } from '../audio/genres';
import { ROLES, ROLE_META, type Role } from '../audio/kits';
import { sampledRoles, variantsFor, getGenreVariant, setGenreVariant } from '../audio/kits/index';
import {
  genreRoleWeight,
  supportedRoster,
  supportedSlots,
  SLOTS,
  SLOT_ROSTER,
  SLOT_LABEL,
} from './band';
import { TIER_NUMERALS } from './hud';
import { ENEMIES, enemyScaling, RUN, type EnemyKind } from './config';
import { ITEM_IDS, ITEMS } from './items';
import type { RunWorld } from './run';

const ENEMY_KINDS: EnemyKind[] = [
  'swarmer',
  'tank',
  'darter',
  'splitter',
  'charger',
  'circler',
  'shielded',
  'spitter',
  'elite',
];

export interface SandboxPanel {
  destroy(): void;
}

export interface SandboxOpts {
  genres: Genre[];
  initial: GenreId;
  onGenre: (genre: Genre) => void;
  onExit: () => void;
  /** The loadout changed (force-assembly): keep the band rack in sync. The
   *  sandbox itself ignores slot rules — it lets any combination be built. */
  onLoadout?: () => void;
}

export function mountSandboxPanel(
  root: HTMLElement,
  engine: MusicEngine,
  world: RunWorld,
  opts: SandboxOpts,
): SandboxPanel {
  const panel = document.createElement('div');
  panel.className = 'sandbox-panel';
  root.appendChild(panel);

  const el = (tag: string, className: string, parent: HTMLElement, text = ''): HTMLElement => {
    const node = document.createElement(tag);
    node.className = className;
    if (text) node.textContent = text;
    parent.appendChild(node);
    return node;
  };

  const head = el('div', 'sb-head', panel);
  el('span', 'sb-title', head, 'sandbox');
  const exitBtn = el('button', 'small', head, '← leave') as HTMLButtonElement;
  exitBtn.onclick = opts.onExit;

  // ---- genre switcher: swap tempo, swing, the genre's own voicing, AND its
  // supported instrument set ----
  el('div', 'sb-section', panel, 'genre');
  const genreRow = el('div', 'sb-btns sb-controls', panel);
  const genreBtns: HTMLButtonElement[] = [];
  let currentGenreId: GenreId = opts.initial;
  for (const g of opts.genres) {
    const b = el('button', 'small', genreRow, g.name) as HTMLButtonElement;
    b.onclick = () => {
      currentGenreId = g.id;
      opts.onGenre(g);
      genreBtns.forEach((x) => x.classList.toggle('on', x === b));
      renderOptimizedFor();
      renderProtoSelector();
      refreshCustom();
      // A dropped-slot instrument may have vanished from this genre; re-fire the
      // full band so it reassembles from the genre's supported slots.
      if (bandOn) {
        bandOn = false;
        bandBtn.click();
      }
    };
    if (g.id === opts.initial) b.classList.add('on');
    genreBtns.push(b);
  }

  // ---- optimized-for readout: which instruments this genre is built around ----
  // Play-testing reads this to know each genre's set (genres may drop slots).
  el('div', 'sb-section', panel, 'optimized for');
  const optimizedFor = el('div', 'sb-hint', panel, '');
  const renderOptimizedFor = (): void => {
    const names = supportedRoles(currentGenreId).map((r) => ROLE_META[r].name);
    optimizedFor.textContent = `${names.length} instruments: ${names.join(', ')}`;
  };

  // Assemble a representative full band for the current genre so its whole track
  // can be heard at once: its idiomatic instrument in each SUPPORTED slot, all
  // at tier 4. Toggles off (silences every voice) when pressed again.
  let bandOn = false;
  const bandBtn = el('button', 'small sb-controls', panel, '▶ play full band') as HTMLButtonElement;
  const bestForSlot = (slot: Parameters<typeof supportedRoster>[1]): ReturnType<typeof supportedRoster>[number] => {
    const roster = supportedRoster(currentGenreId, slot);
    return roster.reduce((best, r) =>
      genreRoleWeight(currentGenreId, r) > genreRoleWeight(currentGenreId, best) ? r : best,
    );
  };
  bandBtn.onclick = () => {
    bandOn = !bandOn;
    for (const role of ROLES) {
      engine.setVoiceEnabled(role, false);
      world.removeWeapon(role);
    }
    if (bandOn) {
      for (const slot of supportedSlots(currentGenreId)) {
        const role = bestForSlot(slot);
        engine.setVoiceTier(role, 4);
        engine.setVoiceEnabled(role, true);
        world.addWeapon(role, 4);
      }
    }
    bandBtn.classList.toggle('on', bandOn);
    bandBtn.textContent = bandOn ? '■ stop full band' : '▶ play full band';
    opts.onLoadout?.();
  };

  renderOptimizedFor();

  // ---- kit prototype selector: A/B the genre's alternative sampled voicings ----
  // Switching a prototype re-renders the genre's kit (setGenreVariant drops the
  // cache) and re-applies the genre so every voice picks up the new samples.
  // Genres with no prototypes (e.g. House, already finalized) show nothing.
  el('div', 'sb-section', panel, 'kit prototype');
  const protoRow = el('div', 'sb-btns sb-controls', panel);
  const protoHint = el('div', 'sb-hint', panel, '');
  const renderProtoSelector = (): void => {
    protoRow.innerHTML = '';
    const variants = variantsFor(currentGenreId);
    if (variants.length <= 1) {
      protoRow.style.display = 'none';
      protoHint.textContent = 'no alternative kits for this genre (using the shipped voicing).';
      return;
    }
    protoRow.style.display = '';
    protoHint.textContent = 'pick a voicing, then play the full band or force any voice to compare.';
    const active = getGenreVariant(currentGenreId);
    for (const v of variants) {
      const b = el('button', 'small', protoRow, v.name) as HTMLButtonElement;
      if (v.desc) b.title = v.desc;
      b.classList.toggle('on', v.id === active);
      b.onclick = () => {
        setGenreVariant(currentGenreId, v.id);
        opts.onGenre(currentGenre());       // re-apply so the new samples load
        [...protoRow.children].forEach((c) => c.classList.toggle('on', c === b));
        refreshCustom();
      };
    }
  };
  const currentGenre = (): Genre => opts.genres.find((g) => g.id === currentGenreId)!;
  renderProtoSelector();

  // ---- enemy roster: stats and spawn buttons ----
  el('div', 'sb-section', panel, 'enemies');

  // Stage-minute preview: spawns come out scaled (hp, damage, speed, xp,
  // visual band) exactly as they would at that point of a real run.
  const statEls = new Map<EnemyKind, HTMLElement>();
  const refreshStats = () => {
    const t01 = world.stageTimeOverride / RUN.durationS;
    for (const [kind, node] of statEls) {
      const conf = ENEMIES[kind];
      const s = enemyScaling(t01, kind);
      node.textContent =
        `hp ${Math.round(conf.hp * s.hpMul)} · dmg ${Math.round(conf.damage * s.dmgMul)}` +
        ` · spd ${Math.round(conf.speed * s.spdMul)} · xp ${Math.round(conf.xp * s.xpMul)}`;
    }
  };
  const minuteRow = el('div', 'sb-enemy', panel);
  el('span', 'sb-enemy-name', el('div', 'sb-enemy-info', minuteRow), 'stage minute');
  const minuteBtns = el('div', 'sb-btns', minuteRow);
  const minuteOpts: HTMLButtonElement[] = [];
  for (const min of [0, 2, 4, 6, 8]) {
    const b = el('button', 'small', minuteBtns, String(min)) as HTMLButtonElement;
    b.onclick = () => {
      world.stageTimeOverride = min * 60;
      minuteOpts.forEach((o) => o.classList.toggle('on', o === b));
      refreshStats();
    };
    minuteOpts.push(b);
  }
  minuteOpts[0].classList.add('on');

  for (const kind of ENEMY_KINDS) {
    const row = el('div', 'sb-enemy', panel);
    const info = el('div', 'sb-enemy-info', row);
    el('span', 'sb-enemy-name', info, kind);
    statEls.set(kind, el('span', 'sb-enemy-stats', info));
    const btns = el('div', 'sb-btns', row);
    const one = el('button', 'small', btns, '+1') as HTMLButtonElement;
    one.onclick = () => world.spawnEnemy(kind);
    const few = el('button', 'small', btns, '+8') as HTMLButtonElement;
    few.onclick = () => {
      for (let i = 0; i < 8; i++) world.spawnEnemy(kind);
    };
    const ring = el('button', 'small', btns, 'ring') as HTMLButtonElement;
    ring.onclick = () => world.spawnRingOf(kind, 24);
  }
  refreshStats();

  const controls = el('div', 'sb-btns sb-controls', panel);
  const clear = el('button', 'small', controls, 'clear all') as HTMLButtonElement;
  clear.onclick = () => world.clearEnemies();
  const invuln = el('button', 'small', controls, 'invulnerable') as HTMLButtonElement;
  const syncInvuln = () => invuln.classList.toggle('on', world.invincible);
  invuln.onclick = () => {
    world.invincible = !world.invincible;
    syncInvuln();
  };
  syncInvuln();

  // ---- loadout editor: any weapon at any tier, applied instantly ----
  // Grouped by band slot (Beat / Snap / Tick / … , the rack order at the top of
  // the screen) instead of a flat list, so a voice is easy to find by its job.
  // A ★ custom badge marks the roles that are sample-backed for the active
  // genre + prototype (its own voicing, worth focusing testing on); it updates
  // when the genre or prototype changes.
  el('div', 'sb-section', panel, 'loadout');
  // Rows carry their slot so the custom badge can refresh on genre/proto change.
  const customBadges: { role: Role; badge: HTMLElement }[] = [];
  for (const slot of SLOTS) {
    el('div', 'sb-slot-head', panel, SLOT_LABEL[slot]);
    for (const role of SLOT_ROSTER[slot]) {
      const voice = engine.voices.get(role)!;
      const row = el('div', 'sb-loadout', panel);
      row.style.setProperty('--voice-color', voice.kit.color);
      const name = el('div', 'sb-loadout-name', row);
      el('span', 'sb-loadout-label', name, voice.kit.name);
      const badge = el('span', 'sb-custom-badge', name, '★ custom');
      customBadges.push({ role, badge });
      const btns = el('div', 'sb-btns', row);
      const options: HTMLButtonElement[] = [];
      const set = (tier: number | null) => {
        if (tier === null) {
          engine.setVoiceEnabled(role, false);
          world.removeWeapon(role);
        } else {
          engine.setVoiceTier(role, tier);
          engine.setVoiceEnabled(role, true);
          world.addWeapon(role, tier);
        }
        options.forEach((b, i) =>
          b.classList.toggle('on', tier === null ? i === 0 : i === tier),
        );
        opts.onLoadout?.();
      };
      const off = el('button', 'small', btns, 'off') as HTMLButtonElement;
      off.onclick = () => set(null);
      options.push(off);
      TIER_NUMERALS.forEach((numeral, i) => {
        const b = el('button', 'small', btns, numeral) as HTMLButtonElement;
        b.onclick = () => set(i + 1);
        options.push(b);
      });
      const current = world.tiers.get(role);
      options.forEach((b, i) => b.classList.toggle('on', current === undefined ? i === 0 : i === current));
    }
  }
  // Show ★ custom only on the roles sampled for the active genre + prototype.
  function refreshCustom(): void {
    const custom = sampledRoles(currentGenreId);
    for (const { role, badge } of customBadges) {
      badge.style.display = custom.has(role) ? '' : 'none';
    }
  }
  refreshCustom();

  // ---- items editor: dial any passive to any level, applied instantly ----
  el('div', 'sb-section', panel, 'items');
  for (const id of ITEM_IDS) {
    const def = ITEMS[id];
    const row = el('div', 'sb-loadout', panel);
    row.style.setProperty('--voice-color', def.color);
    el('span', 'sb-loadout-name', row, def.name);
    const btns = el('div', 'sb-btns', row);
    const options: HTMLButtonElement[] = [];
    const set = (level: number | null): void => {
      if (level === null) world.removeItem(id);
      else world.addItem(id, level);
      options.forEach((b, i) => b.classList.toggle('on', level === null ? i === 0 : i === level));
    };
    const off = el('button', 'small', btns, 'off') as HTMLButtonElement;
    off.onclick = () => set(null);
    options.push(off);
    for (let lvl = 1; lvl <= def.maxLevel; lvl++) {
      const b = el('button', 'small', btns, String(lvl)) as HTMLButtonElement;
      b.onclick = () => set(lvl);
      options.push(b);
    }
    const current = world.items.get(id);
    options.forEach((b, i) => b.classList.toggle('on', current === undefined ? i === 0 : i === current));
  }

  el(
    'div',
    'sb-hint',
    panel,
    'stage script off: nothing spawns by itself. O = perf overlay, C = chart overlay.',
  );

  return {
    destroy(): void {
      panel.remove();
    },
  };
}
