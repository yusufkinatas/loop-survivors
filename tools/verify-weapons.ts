// Headless weapon smoke test: drive a real RunWorld, fire every weapon, and
// report which ones actually landed damage.
//
//   npx tsx tools/verify-weapons.ts
//
// WHY THIS EXISTS RATHER THAN A BROWSER CHECK. The game loop is driven by
// requestAnimationFrame, which Chrome does not run in a hidden tab — so an
// automated browser check can play audio (the AudioContext has its own clock)
// while the world never advances a single frame and every weapon silently
// reports zero. The world and the weapon modules touch no DOM, so driving them
// directly is both honest and faster.
//
// It caught a real bug on the palette's first pass (#266). `ctx.zones()` and
// `ctx.shockwaves()` hand back EVERY zone and wave on the field, and the chord
// and bass modules step all of them — so two new weapons that spawned through
// those shared arrays were being grown on another weapon's schedule and having
// their damage credited to another weapon's total. Both read as "deals no
// damage", and nothing else would have shown it.

import { RunWorld } from '../src/game/run';
import { WEAPON_MODULES } from '../src/game/weapons';
import { WEAPON_MAX_LEVEL } from '../src/game/weapons/levels';

const noop = () => {};
const world = new RunWorld(
  { width: 1280, height: 800 },
  { onLevelUp: noop, onDeath: noop, onVictory: noop, onHit: noop },
  {
    scripted: false,
    fx: false,
    rng: () => 0.5,
    // The player WALKS. Weapons aimed by steering rather than by auto-aim (the
    // snare, the shaker) have no heading in a stationary harness.
    control: () => ({ x: 1, y: 0 }),
  },
);

const roles = WEAPON_MODULES.map((m) => m.role);
for (const role of roles) world.addWeapon(role, WEAPON_MAX_LEVEL);

const SIM_DT = 1 / 60;
let thrown: string | null = null;
try {
  for (let step = 0; step < 60 * 30; step++) {
    // Bodies at EVERY range. A melee strip, a wide aura and a long beam need
    // completely different distances to have anything to hit, so a single ring
    // only ever exercises one of them.
    if (step % 20 === 0) {
      const p = world.player;
      for (const dist of [40, 90, 160, 260, 380]) {
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2 + dist;
          world.spawnEnemyAt('zombie', p.x + Math.cos(a) * dist, p.y + Math.sin(a) * dist);
        }
      }
    }
    if (step % 12 === 0) {
      for (const role of roles) {
        world.fireTrigger({ role, time: 0, velocity: 0.9, step: step % 64 });
      }
    }
    world.update(SIM_DT);
  }
} catch (e) {
  thrown = String((e as Error)?.stack ?? e);
}

const dmg = world.damageByRole as Record<string, number>;
const silent = roles.filter((r) => !dmg[r]);
console.log(`${roles.length} weapons, 30s of game time, ${world.enemies.length} enemies left`);
console.log('thrown:', thrown ?? 'none');
console.log('no damage:', silent.length ? silent.join(', ') : 'none — every weapon landed hits');
console.log();
for (const role of roles) {
  console.log('  ' + role.padEnd(9) + (dmg[role] ? Math.round(dmg[role]).toString().padStart(8) : '       -'));
}
// A weapon in a crowded field can legitimately land nothing because faster
// weapons cleared the enemies first — the snare fires one shot down one line
// while eighteen others sweep the screen. Re-run it alone before believing a
// zero.
if (thrown) process.exitCode = 1;
