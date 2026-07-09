// The sandbox (M2 spec, developer tools): the real game arena with the
// stage script switched off. Enemies are watched, weapons tested, and
// balance gates run under reproducible conditions here. The rehearsal room
// is for listening; the sandbox is for watching and testing.

import type { MusicEngine } from '../audio/engine';
import { supportedRoles } from '../audio/soundset';
import { ROLES, ROLE_META, type Role } from '../audio/kits';
import { sampledRoles } from '../audio/kits/index';
import {
  supportedRoster,
  supportedSlots,
  SLOTS,
  SLOT_ROSTER,
  SLOT_LABEL,
} from './band';
import { TIER_NUMERALS } from './hud';
import { ENEMIES, enemyScaling, RUN, type EnemyKind } from './config';
import type { RunWorld } from './run';

const ENEMY_KINDS: EnemyKind[] = [
  'swarmer',
  'tank',
  'darter',
  'splitter',
  'charger',
  'circler',
  'shielded',
  'elite',
];

export interface SandboxPanel {
  destroy(): void;
}

export interface SandboxOpts {
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

  // ---- instrument readout: which instruments the soundset is built around ----
  // Play-testing reads this to know the set (some slots are dropped).
  el('div', 'sb-section', panel, 'instruments');
  const optimizedFor = el('div', 'sb-hint', panel, '');
  const names = supportedRoles().map((r) => ROLE_META[r].name);
  optimizedFor.textContent = `${names.length} instruments: ${names.join(', ')}`;

  // Assemble a representative full band so the whole track can be heard at once:
  // one instrument in each SUPPORTED slot, all at tier 4. Toggles off (silences
  // every voice) when pressed again.
  let bandOn = false;
  const bandBtn = el('button', 'small sb-controls', panel, '▶ play full band') as HTMLButtonElement;
  const firstForSlot = (slot: Parameters<typeof supportedRoster>[0]): Role =>
    supportedRoster(slot)[0];
  bandBtn.onclick = () => {
    bandOn = !bandOn;
    for (const role of ROLES) {
      engine.setVoiceEnabled(role, false);
      world.removeWeapon(role);
    }
    if (bandOn) {
      for (const slot of supportedSlots()) {
        const role = firstForSlot(slot);
        engine.setVoiceTier(role, 4);
        engine.setVoiceEnabled(role, true);
        world.addWeapon(role, 4);
      }
    }
    bandBtn.classList.toggle('on', bandOn);
    bandBtn.textContent = bandOn ? '■ stop full band' : '▶ play full band';
    opts.onLoadout?.();
  };

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
  // A ★ custom badge marks the roles that are sample-backed (their own real
  // voicing, worth focusing testing on).
  el('div', 'sb-section', panel, 'loadout');
  // Rows carry their name element so refreshCustom can toggle the sample-backed
  // mark (a border on the name).
  const customMarks: { role: Role; el: HTMLElement }[] = [];
  for (const slot of SLOTS) {
    el('div', 'sb-slot-head', panel, SLOT_LABEL[slot]);
    for (const role of SLOT_ROSTER[slot]) {
      const voice = engine.voices.get(role)!;
      const row = el('div', 'sb-loadout', panel);
      row.style.setProperty('--voice-color', voice.kit.color);
      const name = el('div', 'sb-loadout-name', row);
      const label = el('span', 'sb-loadout-label', name, voice.kit.name);
      customMarks.push({ role, el: label });
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
      const off = el('button', 'small off-btn', btns, '⏻') as HTMLButtonElement;
      off.title = 'off';
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
  // Mark (with a bordered name) the roles that are sample-backed — their own
  // real voicing, worth focusing testing on.
  function refreshCustom(): void {
    const custom = sampledRoles();
    for (const { role, el: mark } of customMarks) {
      const on = custom.has(role);
      mark.classList.toggle('custom', on);
      mark.title = on ? 'custom voicing (sample-backed)' : '';
    }
  }
  refreshCustom();

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
