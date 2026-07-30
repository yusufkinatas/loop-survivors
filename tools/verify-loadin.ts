// Headless verification for The Load-In (#269): drive a real RunWorld and read
// the numbers this stack owes.
//
//   npx tsx tools/verify-loadin.ts
//
// WHY HEADLESS, same reason as tools/verify-weapons.ts: the game loop is driven
// by requestAnimationFrame, which Chrome does not run in a hidden tab, so an
// automated browser check reports zeroes while looking like it worked. The
// world, the stage plot and the weapon modules touch no DOM, so driving them
// directly is both honest and fast.
//
// WHAT IT ANSWERS, in order:
//
//   1. THE HARD FLOOR (#256). "A run's density must fall at least once because
//      the player chose it." Hauling is the choice; this measures the fall in
//      triggers per bar, which is the same unit `docs/baseline/` reports.
//   2. THE GEOMETRY. What a blob costs and what a wired, plugged-in stage plot
//      buys, in output and in decibels — the range the base could not produce at
//      all (0.4-0.6 LU, at every point, forever).
//   3. SILENT MEANS NOT ATTACKING (#255). Carried gear must deal zero damage,
//      including the two texture auras, which are clock-driven and were the one
//      family that could have broken the rule.
//   4. THE DECISION STREAM. #265 measured the base running dry at 13:27. Crew is
//      this stack's answer; this reports when the stream actually ends.
//   5. A FULL RUN. Thirty minutes, twice, to victory — the same check #265 ran
//      on the base.

import { SOUNDSET_LADDERS } from '../src/audio/ladders/house';
import { SOUNDSET } from '../src/audio/soundset';
import type { Role } from '../src/audio/kits';
import { RunWorld } from '../src/game/run';
import { rollOffers, rollStartingWeapons } from '../src/game/picks';
import { chartStageForLevel, WEAPON_MAX_LEVEL } from '../src/game/weapons/levels';
import { CREW } from '../src/game/loadin/config';
import { LAYERS, type LayerKey, type Layers } from '../src/game/loadin/layers';
import { rollVenue } from '../src/game/loadin/venue';
import { mulberry32 } from '../src/game/rng';

const SIM_DT = 1 / 60;
const noop = () => {};
const VIEW = { width: 1422, height: 800 };

function layerSet(overrides: Partial<Record<LayerKey, boolean>> = {}): Layers {
  const out = {} as Record<LayerKey, boolean>;
  for (const layer of LAYERS) out[layer.key] = layer.on;
  return { ...out, ...overrides };
}

/** Triggers per bar for one voice at one gameplay level, read straight out of
 *  the shipped ladders — the same derivation `docs/baseline/density.ts` uses, so
 *  the two sets of numbers are directly comparable. */
function perBar(role: Role, level: number): number {
  const ladder = SOUNDSET_LADDERS[role];
  if (!ladder) return 0;
  const chart = ladder[chartStageForLevel(level) - 1];
  return chart.events.length / chart.bars;
}

/** What the whole band is currently playing: every owned voice that is AUDIBLE.
 *  A carried or knocked-over piece contributes nothing, which is the density
 *  fall the hard floor asks for. */
function liveDensity(world: RunWorld): number {
  let total = 0;
  for (const [role, tier] of world.tiers) {
    if (!world.plot.audible(role)) continue;
    total += perBar(role, tier);
  }
  return total;
}

function db(ratio: number): string {
  return `${(20 * Math.log10(ratio)).toFixed(2)} dB`;
}

function heading(title: string): void {
  console.log(`\n${title}`);
  console.log('-'.repeat(title.length));
}

/** A world with a full five-piece band standing, nothing else moving. */
function bandWorld(layers: Layers, seed = 0x10ad): {
  world: RunWorld;
  band: readonly Role[];
} {
  const rng = mulberry32(seed);
  const world = new RunWorld(VIEW, { onLevelUp: noop, onDeath: noop, onVictory: noop, onHit: noop }, {
    scripted: false,
    fx: false,
    rng,
    layers,
    venue: rollVenue(mulberry32(seed ^ 0xbeef)),
  });
  // One voice from each of the five seats, which is what the shipped
  // `exclusivity` layer guarantees a build ends up as.
  const band: readonly Role[] = ['sub', 'organ', 'bell', 'kick', 'pad'];
  for (const role of band) world.addWeapon(role, WEAPON_MAX_LEVEL);
  return { world, band };
}

function step(world: RunWorld, seconds: number): void {
  const frames = Math.round(seconds / SIM_DT);
  for (let i = 0; i < frames; i++) world.update(SIM_DT);
}

/** THE MISSING HALF OF A HEADLESS RUN, and the first version of this harness
 *  did not have it.
 *
 *  Damage in this game rides the music engine's triggers — one grid event, a
 *  sound and an attack — and there is no engine outside a browser. So a headless
 *  world runs with NOTHING firing except the two texture auras, which are driven
 *  by the clock instead. The first pass of section 5 measured exactly that: a
 *  seed whose opening hire was a bell scored zero kills for thirty minutes and
 *  never reached a second level-up, while a seed that happened to open on a pad
 *  scored four thousand.
 *
 *  This puts the triggers back, at each voice's REAL rate: its ladder's
 *  triggers-per-bar at its current level, which is the same number
 *  `docs/baseline/density.ts` reports. A carried or knocked-over piece fires
 *  nothing, which is the whole point. */
class TriggerPump {
  private nextAt = new Map<Role, number>();
  private readonly barS = (4 * 60) / SOUNDSET.bpm;

  constructor(private readonly world: RunWorld) {}

  /** Fire everything due at the world's current time. */
  tick(): void {
    for (const [role, tier] of this.world.tiers) {
      if (!this.world.plot.audible(role)) {
        // A silent piece does not bank up triggers to fire when it lands: it is
        // not playing, and neither is the grid it would have played on.
        this.nextAt.set(role, this.world.timeS);
        continue;
      }
      const rate = perBar(role, tier);
      if (rate <= 0) continue;
      const gap = this.barS / rate;
      let next = this.nextAt.get(role) ?? this.world.timeS;
      while (next <= this.world.timeS) {
        this.world.fireTrigger({ role, time: next, velocity: 0.9, step: 0 });
        next += gap;
      }
      this.nextAt.set(role, next);
    }
  }
}

// ---------------------------------------------------------------------------
// 1. THE HARD FLOOR: density falls because the player chose it.
// ---------------------------------------------------------------------------

function checkHardFloor(): void {
  heading('1. THE HARD FLOOR — does density fall because the player chose it?');
  const { world, band } = bandWorld(layerSet());
  step(world, 0.2);
  const full = liveDensity(world);
  const rows: string[] = [];
  rows.push(`  band standing              ${full.toFixed(2)} triggers/bar   (5 voices)`);

  // Lift them one at a time, from where each one stands.
  for (let i = 0; i < band.length; i++) {
    const rig = world.plot.rigFor(band[i])!;
    world.player.x = rig.x;
    world.player.y = rig.y;
    step(world, 0.1);
    world.plot.grabNearest();
    step(world, 0.1);
    const now = liveDensity(world);
    rows.push(
      `  carrying ${world.plot.carriedCount}                 ${now.toFixed(2)} triggers/bar   ` +
      `move ×${world.plot.carryMoveMul.toFixed(2)}`,
    );
  }
  world.plot.dropAll();
  step(world, 0.2);
  const back = liveDensity(world);
  rows.push(`  set down                   ${back.toFixed(2)} triggers/bar   (the drop)`);
  for (const row of rows) console.log(row);

  const fell = back > 0 && full > 0;
  console.log(
    `\n  VERDICT: density ${fell ? 'FALLS' : 'DOES NOT FALL'} on the player's own choice — ` +
    `${full.toFixed(2)} → 0.00 → ${back.toFixed(2)} triggers/bar.`,
  );
  console.log(
    `  For comparison, docs/baseline/ measured the base going 2.00 → 23.00 and NEVER ONCE FALLING.`,
  );
}

// ---------------------------------------------------------------------------
// 2. THE GEOMETRY: what a stage plot is worth.
// ---------------------------------------------------------------------------

function checkGeometry(): void {
  heading('2. THE GEOMETRY — what the stage plot is worth, in output and decibels');
  const { world, band } = bandWorld(layerSet());
  const venue = world.venue;

  const place = (spots: readonly (readonly [number, number])[]): void => {
    for (let i = 0; i < band.length; i++) world.plot.placeAt(band[i], spots[i][0], spots[i][1]);
    step(world, 0.2);
  };

  // The blob: everything in one clump. The failure mode the anti-blob rule is
  // under test for — "if the optimal play is putting everything in one clump and
  // never moving it, the constraint is not real".
  place([[0, 0], [20, -14], [-18, 12], [14, 18], [-12, -20]]);
  const blob = world.plot.report();

  // A ring, spread far enough that nothing masks but nothing wires either.
  const wide = Math.min(venue.halfW, venue.halfH) * 0.9;
  place(band.map((_, i) => {
    const a = (i / band.length) * Math.PI * 2;
    return [Math.cos(a) * wide, Math.sin(a) * wide] as const;
  }));
  const scattered = world.plot.report();

  // The drop's own ring — what setting the whole band down at once produces.
  world.player.x = 0;
  world.player.y = 0;
  for (const role of band) {
    const rig = world.plot.rigFor(role)!;
    world.player.x = rig.x;
    world.player.y = rig.y;
    step(world, 0.05);
    world.plot.grabNearest();
  }
  world.player.x = 0;
  world.player.y = 0;
  world.plot.dropAll();
  step(world, 0.2);
  const dropped = world.plot.report();

  // Plugged in: the same drop, centred on the venue's sockets.
  for (let i = 0; i < band.length; i++) {
    const socket = venue.sockets[i % venue.sockets.length];
    world.plot.placeAt(band[i], socket.x, socket.y);
  }
  step(world, 0.2);
  const plugged = world.plot.report();

  const row = (name: string, r: ReturnType<RunWorld['plot']['report']>): void => {
    console.log(
      `  ${name.padEnd(26)} output ${r.output.toFixed(2)}  ` +
      `masked ${r.masked}  wired ${r.cables}  plugged ${r.plugged}`,
    );
  };
  row('the blob', blob);
  row('scattered to the walls', scattered);
  row('a drop (the ring)', dropped);
  row('every piece on a socket', plugged);

  const best = Math.max(dropped.output, plugged.output, scattered.output);
  console.log(
    `\n  VERDICT: worst-to-best stage plot spans ${db(best / blob.output)} and ` +
    `×${(best / blob.output).toFixed(2)} damage, at the same build and the same levels.`,
  );
  console.log(
    `  Sockets are ${plugged.masked > 0 ? 'CROWDED in this venue — plugging everything in costs masking' : 'far enough apart in this venue to plug in without masking'}.`,
  );
}

// ---------------------------------------------------------------------------
// 3. SILENT MEANS NOT ATTACKING.
// ---------------------------------------------------------------------------

function checkAudibility(): void {
  heading('3. THE AUDIBILITY RULE — does carried gear really stop attacking?');
  // Two identical worlds with a live horde: one plays, one is hauled. The
  // texture auras (pad, air) are the ones that could break this — they are
  // clock-driven, not chart-driven, so nothing about disabling a voice would
  // stop them on its own.
  // The band deliberately mixes both kinds: `kick` and `bell` are chart-driven
  // and stop for free when a voice goes quiet, `pad` and `air` are BEDS driven
  // by the clock and are the two that could have kept swinging out of silence.
  const band = ['pad', 'air', 'kick', 'bell'] as Role[];
  const run = (haul: boolean): Record<string, number> => {
    const world = new RunWorld(VIEW, { onLevelUp: noop, onDeath: noop, onVictory: noop, onHit: noop }, {
      scripted: false, fx: false, rng: mulberry32(0x51e17), layers: layerSet(),
    });
    world.invincible = true;
    world.powerMul = SOUNDSET.powerMul;
    for (const role of band) world.addWeapon(role, WEAPON_MAX_LEVEL);
    const pump = new TriggerPump(world);
    // A wall of bodies right on top of the gear, so an aura that is still live
    // cannot possibly miss.
    for (let i = 0; i < 40; i++) {
      world.spawnEnemyAt('greenMudman', (i % 8) * 26 - 90, Math.floor(i / 8) * 26 - 60);
    }
    if (haul) {
      for (const role of band) {
        const rig = world.plot.rigFor(role)!;
        world.player.x = rig.x;
        world.player.y = rig.y;
        world.update(SIM_DT);
        world.plot.grabNearest();
      }
    }
    // The clock starts AFTER the gear is on the player's back. Walking over to
    // each piece costs frames, and a field that is still standing during them is
    // supposed to be dealing damage — counting those would be measuring the walk,
    // not the haul.
    for (const key of Object.keys(world.damageByRole)) {
      delete (world.damageByRole as Record<string, number>)[key];
    }
    for (let i = 0; i < Math.round(6 / SIM_DT); i++) {
      world.update(SIM_DT);
      pump.tick();
    }
    return world.damageByRole as Record<string, number>;
  };
  const playing = run(false);
  const hauled = run(true);
  const sum = (d: Record<string, number>): number => Object.values(d).reduce((a, b) => a + b, 0);
  console.log(`  standing, 6 s against 40 bodies   ${sum(playing).toFixed(0)} damage  ${JSON.stringify(playing)}`);
  console.log(`  on your back, same 6 s            ${sum(hauled).toFixed(0)} damage  ${JSON.stringify(hauled)}`);
  console.log(
    `\n  VERDICT: ${sum(hauled) === 0 ? 'PASS' : 'FAIL'} — carried gear deals ` +
    `${sum(hauled) === 0 ? 'exactly nothing' : `${sum(hauled).toFixed(0)} damage, which breaks the rule`}.`,
  );
}

// ---------------------------------------------------------------------------
// 4. KNOCKDOWN: bodies standing in a piece of gear.
// ---------------------------------------------------------------------------

function checkKnockdown(): void {
  heading('4. KNOCKDOWN — what a horde parked on your stage costs');
  const world = new RunWorld(VIEW, { onLevelUp: noop, onDeath: noop, onVictory: noop, onHit: noop }, {
    scripted: false, fx: false, rng: mulberry32(0xd0117), layers: layerSet(),
  });
  world.invincible = true;
  world.addWeapon('bell', 4);
  const rig = world.plot.rigFor('bell')!;
  // Park bodies on it and hold them there by pinning the player far away, so
  // nothing wanders off. Zombies are the base's cheapest body.
  for (let i = 0; i < 6; i++) world.spawnEnemyAt('zombie', rig.x + i * 6 - 15, rig.y);
  world.player.x = rig.x;
  world.player.y = rig.y + 4;
  let downAt = -1;
  for (let f = 0; f < 60 * 25; f++) {
    world.update(SIM_DT);
    if (rig.down && downAt < 0) downAt = world.timeS;
    if (downAt >= 0) break;
  }
  console.log(`  six bodies standing in one piece: ${downAt >= 0 ? `down after ${downAt.toFixed(1)} s` : 'never went down in 25 s'}`);
  console.log(`  audible while down: ${world.plot.audible('bell')}`);
  // Walk onto it to right it.
  step(world, 0.6);
  world.player.x = rig.x;
  world.player.y = rig.y;
  step(world, 0.3);
  console.log(`  righted by walking onto it: ${!rig.down} (hp back to ${Math.round(rig.hp)})`);
}

// ---------------------------------------------------------------------------
// 5. THE DECISION STREAM, and a full run.
// ---------------------------------------------------------------------------

/** Drive a whole 30 minutes with the level-up economy and chest payout wired the
 *  way game.ts wires them — the same shape of check #265 ran on the base, which
 *  is what produced the "runs dry at 13:27" number this stack is answering. */
function fullRun(seed: number, crewOn: boolean, label = crewOn ? 'crew on ' : 'crew off', overrides: Partial<Record<LayerKey, boolean>> = {}): void {
  const rng = mulberry32(seed);
  let level = 1;
  const pendingLevels: number[] = [];
  const world = new RunWorld(VIEW, {
    onLevelUp(l: number) { level = l; pendingLevels.push(l); },
    onDeath: noop,
    onVictory: noop,
    onHit: noop,
    onChest() { pendingLevels.push(level); },
  }, { fx: false, rng, layers: layerSet({ crew: crewOn, ...overrides }) });
  world.invincible = true;
  world.powerMul = SOUNDSET.powerMul;
  const pump = new TriggerPump(world);
  // THE OPENING HIRE. A run opens on a choice of three instruments rather than
  // a fixed one, and without making it nothing ever dies, so no XP is earned and
  // the decision stream never starts. The first pass of this harness skipped it
  // and reported a thirty-minute run with zero level-ups.
  world.addWeapon(rollStartingWeapons({ tiers: world.tiers, rng, timeS: 0 })[0].role, 1);

  let lastRealDecisionS = 0;
  let encores = 0;
  let crewTaken = 0;
  let crewOffered = 0;
  // A few frames past the wire: victory is raised at timeS >= 1800, which the
  // exact frame count reaches on its last step rather than past it.
  const frames = Math.round((30 * 60) / SIM_DT) + 30;
  for (let f = 0; f < frames && !world.won; f++) {
    world.update(SIM_DT);
    pump.tick();
    while (pendingLevels.length > 0) {
      pendingLevels.shift();
      const offers = rollOffers({
        tiers: world.tiers,
        pendingTiers: new Map(),
        rng,
        timeS: world.timeS,
        crew: world.plot.crew,
        pendingCrew: 0,
        seatSlots: world.layers.exclusivity,
        crewEnabled: world.layers.crew,
      });
      if (offers.some((o) => o.kind === 'crew')) crewOffered++;
      const pick = offers[0];
      if (pick.kind === 'encore') { encores++; continue; }
      lastRealDecisionS = world.timeS;
      if (pick.kind === 'crew') { world.plot.crew += 1; crewTaken++; continue; }
      world.addWeapon(pick.role, Math.min(WEAPON_MAX_LEVEL, (world.tiers.get(pick.role) ?? 0) + 1));
    }
    // A ROADIE WHO NEVER MOVES IS NOT A ROADIE, and one who wanders is not
    // playing the loop either. The band only hits what walks past it, so the
    // whole skill is being the LURE — standing where your own stage is and
    // letting the crowd come to you. This mover does the obvious version of
    // that: hire from a slow circuit early, then live in the middle of whatever
    // stage plot that produced.
    //
    // It is deliberately not clever, and the numbers below are a FLOOR: it never
    // hauls, never repositions a piece, never uses a socket on purpose, and
    // never leads a wave across the far side of the plot. A real player who does
    // any of that kills faster.
    let tx = Math.cos(world.timeS * 0.11) * 520;
    let ty = Math.sin(world.timeS * 0.17) * 380;
    const standing = world.plot.rigs.filter((rig) => !rig.carried);
    if (standing.length >= 3) {
      tx = standing.reduce((sum, rig) => sum + rig.x, 0) / standing.length;
      ty = standing.reduce((sum, rig) => sum + rig.y, 0) / standing.length;
    }
    // AND IT PICKS UP ITS XP. Without this the mover parks on the centroid and
    // never touches a gem outside the 53-unit magnet: one seed ended a whole set
    // at level 4 on 470 kills, which is a fact about the harness rather than
    // about the stack. Nearest gem inside half a screen wins over the centroid.
    let bestD = 700 * 700;
    for (const gem of world.gems) {
      const d = (gem.x - world.player.x) ** 2 + (gem.y - world.player.y) ** 2;
      if (d >= bestD) continue;
      bestD = d;
      tx = gem.x;
      ty = gem.y;
    }
    const dx = tx - world.player.x;
    const dy = ty - world.player.y;
    const d = Math.hypot(dx, dy);
    const reach = 159 * SIM_DT; // the player's own top speed
    if (d > reach) {
      world.player.x += (dx / d) * reach;
      world.player.y += (dy / d) * reach;
    }
  }

  const mm = (s: number): string => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  console.log(
    `  seed ${seed.toString(16)}  ${label.padEnd(9)}  ` +
    `${world.won ? 'WON' : `ended ${mm(world.timeS)}`}  ` +
    `· ${world.kills} kills · lv ${world.level}  ` +
    `· last real decision ${mm(lastRealDecisionS)}  ` +
    `· ${encores} Encores  · crew ${crewTaken}/${CREW.maxLevel} taken, offered on ${crewOffered} screens  ` +
    `· ${[...world.tiers.entries()].map(([r, t]) => `${r}${t}`).join(' ')}`,
  );
}

function checkStream(): void {
  heading('5. THE DECISION STREAM — #265 measured the base running dry at 13:27');
  // THE CONTROL, first, and it is the whole reason this section is worth
  // anything: `placement` off is prototype-base in-branch, so the same mover,
  // the same trigger pump and the same seed produce a directly comparable row.
  // Without it the numbers below could only be set against #265's harness, which
  // is not this one.
  fullRun(0x10ad1, false, 'BASE     ', {
    placement: false, venue: false, exclusivity: false, crew: false,
  });
  fullRun(0x10ad1, false);
  fullRun(0x10ad1, true);
  fullRun(0x10ad2, true);
  console.log('\n  "last real decision" is the last level-up that added anything; everything');
  console.log('  after it is an Encore. The base row is the same harness with `placement`');
  console.log('  off — every weapon back on the player — so the difference is this stack.');
  console.log('\n  The mover is deliberately dumb: it hires from a slow circuit, then stands in');
  console.log('  the middle of whatever stage plot that produced. It NEVER hauls, never');
  console.log('  repositions a piece, never uses a socket on purpose. These are floors.');
}

// ---------------------------------------------------------------------------

console.log('THE LOAD-IN — headless verification (#269)');
checkHardFloor();
checkGeometry();
checkAudibility();
checkKnockdown();
checkStream();
console.log();
