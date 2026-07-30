// Headless weapon smoke test: drive a real RunWorld, fire every weapon, and
// report which ones actually landed damage — BASE MODE AND EVOLVED, side by side.
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
//
// WHY IT NOW RUNS TWICE (#273). Until the palette's eleven got evolutions, this
// harness only ever exercised base mode: it levelled every weapon to max and
// never evolved one, so half of what a maxed weapon can do was never driven at
// all. Eleven new evolved code paths is not something to ship on a typecheck, so
// the second pass evolves the whole roster through `evolveForSandbox` — which
// skips the recipe and costs nothing but the evolution — and reports both
// columns. An evolution that throws, or that silently lands nothing, now shows
// up here rather than in the game.

import type { Role } from '../src/audio/kits';
import { RunWorld } from '../src/game/run';
import { WEAPON_MODULES } from '../src/game/weapons';
import { WEAPON_MAX_LEVEL } from '../src/game/weapons/levels';

const noop = () => {};
const roles = WEAPON_MODULES.map((m) => m.role);
const SIM_DT = 1 / 60;
const SECONDS = 30;
/** Solo passes are shorter: nineteen of them, four times each, and one weapon
 *  alone cannot clear the field, so the signal is there long before 30 s. */
const SOLO_SECONDS = 12;

/** Frames between triggers. The roster pass uses the dense one; solo runs both,
 *  because a uniform rate cannot be fair to a shaker firing twelve times a bar
 *  and a drone firing once every four. */
const DENSE_EVERY = 12;
const SPARSE_EVERY = 120;

/** WHAT THE SOLO PASSES SHOOT AT, and it is not a zombie. `damageByRole` credits
 *  EFFECTIVE damage — Math.min(hp, amount) — and a zombie has 10 hp against
 *  weapons that hit for 16, 18, 36, 41. Every hit overkills, so the number stops
 *  being damage and becomes a body count: the first version of this table read
 *  1.02, 1.05 and exactly 1.00 for three evolutions, purely because both modes
 *  killed the same bodies and the surplus was thrown away. A 150 hp Moss Cabinet
 *  absorbs what it is actually dealt. */
const SOLO_TARGET = 'greenMudman';

interface Pass {
  damage: Record<string, number>;
  enemiesLeft: number;
  thrown: string | null;
}

/** Drive one world for a fixed span. `only` restricts the roster to a single
 *  weapon, which is the only way to read one evolution's effect: in a full
 *  nineteen-weapon field every number is a share of contested bodies, so a
 *  weapon whose neighbours got faster lands less while being stronger. */
function drive(
  evolved: boolean,
  only: Role | null = null,
  seconds = SECONDS,
  triggerEvery = DENSE_EVERY,
  kind: 'zombie' | typeof SOLO_TARGET = 'zombie',
): Pass {
  const firing = only ? [only] : roles;
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

  for (const role of firing) world.addWeapon(role, WEAPON_MAX_LEVEL);
  // Before the first trigger, so a weapon that freezes its mode at fire time
  // (the sub's front, the upright's and flute's and shaker's shots) is evolved
  // for every trigger of the pass rather than for the tail of it.
  if (evolved) for (const role of firing) world.evolveForSandbox(role);

  let thrown: string | null = null;
  try {
    for (let step = 0; step < 60 * seconds; step++) {
      // Bodies at EVERY range. A melee strip, a wide aura and a long beam need
      // completely different distances to have anything to hit, so a single ring
      // only ever exercises one of them.
      if (step % 20 === 0) {
        const p = world.player;
        for (const dist of [40, 90, 160, 260, 380]) {
          for (let k = 0; k < 6; k++) {
            const a = (k / 6) * Math.PI * 2 + dist;
            world.spawnEnemyAt(kind, p.x + Math.cos(a) * dist, p.y + Math.sin(a) * dist);
          }
        }
      }
      if (step % triggerEvery === 0) {
        for (const role of firing) {
          world.fireTrigger({ role, time: 0, velocity: 0.9, step: step % 64 });
        }
      }
      world.update(SIM_DT);
    }
  } catch (e) {
    thrown = String((e as Error)?.stack ?? e);
  }

  return {
    damage: world.damageByRole as Record<string, number>,
    enemiesLeft: world.enemies.length,
    thrown,
  };
}

const base = drive(false);
const evo = drive(true);

const cell = (n: number | undefined): string =>
  n ? Math.round(n).toString().padStart(9) : '        -';

for (const [label, pass] of [['base', base], ['evolved', evo]] as const) {
  const silent = roles.filter((r) => !pass.damage[r]);
  console.log(
    `${label}: ${roles.length} weapons, ${SECONDS}s of game time, `
    + `${pass.enemiesLeft} enemies left`,
  );
  console.log(`  thrown: ${pass.thrown ?? 'none'}`);
  console.log(
    `  no damage: ${silent.length ? silent.join(', ') : 'none — every weapon landed hits'}`,
  );
}

// ---- Solo: one weapon at a time, base against evolved -----------------------
//
// THE ONLY HONEST COMPARISON, and the reason the full-roster ratios above are not
// one. Nineteen weapons share one field: whoever fires first takes the bodies, so
// the roster columns say "nothing throws and everything connects" and nothing
// more. A weapon alone against the same spawns twice over says what its evolution
// actually did.
//
// The drone is the clearest case of why. In the roster pass its evolved column
// collapses, because this harness fires every weapon five times a second — so the
// drone plants five fields a second and Feedback Loop's field cap starts dropping
// them almost immediately, where the uncapped base mode piles up a hundred and
// fifty. A real drone chart fires about once every four bars. The cap is right and
// the harness is wrong; solo, at the same rate, the comparison holds.
let soloThrew = false;
const soloSilent = new Set<string>();

/** One solo block: every weapon alone, base against evolved, at one cadence. */
function soloTable(label: string, triggerEvery: number): void {
  console.log();
  console.log(`  ---- solo vs 150 hp bodies, ${label} ----`);
  console.log('  role          base  evolved      x');
  for (const role of roles) {
    const b = drive(false, role, SOLO_SECONDS, triggerEvery, SOLO_TARGET);
    const e = drive(true, role, SOLO_SECONDS, triggerEvery, SOLO_TARGET);
    soloThrew = soloThrew || Boolean(b.thrown || e.thrown);
    if (b.thrown) console.log(`  ${role} base threw: ${b.thrown}`);
    if (e.thrown) console.log(`  ${role} evolved threw: ${e.thrown}`);
    const bd = b.damage[role];
    const ed = e.damage[role];
    if (!bd || !ed) soloSilent.add(role);
    const ratio = bd && ed ? (ed / bd).toFixed(2).padStart(7) : '      -';
    console.log('  ' + role.padEnd(9) + cell(bd) + cell(ed) + ratio);
  }
}

soloTable('dense cadence (5 triggers/s)', DENSE_EVERY);
// The sparse pass is what makes the slow voices readable. At the dense cadence the
// drone plants five fields a second, which is seven times faster than its own
// busiest chart rung, and Feedback Loop's field cap starts dropping them while
// uncapped base mode piles up a hundred and fifty — so its evolved column collapses
// for a reason that cannot happen in a run. Every weapon whose chart is measured in
// bars rather than beats has some version of that problem.
soloTable('sparse cadence (1 trigger/2s)', SPARSE_EVERY);

console.log();
console.log(
  `  solo silence: ${soloSilent.size ? [...soloSilent].join(', ') : 'none — every weapon lands hits in both modes at both cadences'}`,
);
// A weapon in a crowded field can legitimately land nothing because faster
// weapons cleared the enemies first — the snare fires one shot down one line
// while eighteen others sweep the screen. That is what the solo table is for.
if (base.thrown || evo.thrown || soloThrew) process.exitCode = 1;
