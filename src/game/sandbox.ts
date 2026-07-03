// The sandbox (M2 spec, developer tools): the real game arena with the
// stage script switched off. Enemies are watched, weapons tested, and
// balance gates run under reproducible conditions here. The rehearsal room
// is for listening; the sandbox is for watching and testing.

import type { MusicEngine } from '../audio/engine';
import { ROLES } from '../audio/kits';
import { TIER_NUMERALS } from './hud';
import { ENEMIES, type EnemyKind } from './config';
import type { RunWorld } from './run';

const ENEMY_KINDS: EnemyKind[] = ['swarmer', 'tank', 'darter'];

export interface SandboxPanel {
  destroy(): void;
}

export function mountSandboxPanel(
  root: HTMLElement,
  engine: MusicEngine,
  world: RunWorld,
  onExit: () => void,
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
  exitBtn.onclick = onExit;

  // ---- enemy roster: stats and spawn buttons ----
  el('div', 'sb-section', panel, 'enemies');
  for (const kind of ENEMY_KINDS) {
    const conf = ENEMIES[kind];
    const row = el('div', 'sb-enemy', panel);
    const info = el('div', 'sb-enemy-info', row);
    el('span', 'sb-enemy-name', info, kind);
    el(
      'span',
      'sb-enemy-stats',
      info,
      `hp ${conf.hp} · dmg ${conf.damage} · spd ${conf.speed} · xp ${conf.xp}`,
    );
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
  el('div', 'sb-section', panel, 'loadout');
  for (const role of ROLES) {
    const voice = engine.voices.get(role)!;
    const row = el('div', 'sb-loadout', panel);
    row.style.setProperty('--voice-color', voice.kit.color);
    el('span', 'sb-loadout-name', row, voice.kit.name);
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
