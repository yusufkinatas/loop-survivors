// THE FRONTMAN, driven headlessly (#271).
//
//   npx tsx tools/verify-frontman.ts
//
// Same reasoning as tools/verify-weapons.ts: the browser loop is
// requestAnimationFrame, which Chrome does not run in a hidden tab, so an
// automated browser check can play audio while the world never advances a frame.
// The world, the weapon modules and frontman.ts touch no DOM, so driving them
// directly is both honest and faster.
//
// But there is a second and sharper reason here. THIS BRANCH WAS BUILT WITHOUT AN
// EAR AND WITHOUT A HAND. Nobody playtested it while it was written, so every
// claim about it that can be turned into a number has to be, or the ticket is
// reporting an intention rather than a result. What this measures:
//
//   1  the placement window — does a press land where the grid says it should
//   2  the budget and the one-per-tick rule — can mashing beat placing
//   3  THE KILL CRITERION, priced: placing against mashing, in damage
//   4  the two synergies — do the cue and the charge actually pay
//   5  solo — does the band go down, does the re-entry arrive, is it sized
//   6  DENSITY: triggers a bar at each point on the band <-> hands axis
//   7  a full 30-minute run's decision stream, weapon ranks against mic ranks
//
// The one thing it cannot measure is whether any of it FEELS good. That is the
// designer's, and it is stated as an open question on the ticket rather than
// dressed up as a finding.

import { STEPS_PER_BAR } from '../src/audio/scale';
import { SOUNDSET } from '../src/audio/soundset';
import type { ChartEvent } from '../src/audio/charts';
import { getChart } from '../src/audio/chartstore';
import type { Role } from '../src/audio/kits';
import { RunWorld } from '../src/game/run';
import { Frontman, MIC_STATS, MIC_MAX_RANK, SOLO, type FrontmanBand } from '../src/game/frontman';
import { rollOffers } from '../src/game/picks';
import { chartStageForLevel, WEAPON_MAX_LEVEL } from '../src/game/weapons/levels';
import { mulberry32 } from '../src/game/rng';

const noop = (): void => {};
const SIM_DT = 1 / 60;
const STEP_S = 60 / SOUNDSET.bpm / 4;
const BAR_S = STEP_S * STEPS_PER_BAR;

/** A synthetic grid standing in for the engine. Bars start at t = 0 and every
 *  step is exactly STEP_S long, plus the soundset's shuffle on the offbeat 8th —
 *  the same rule Clock applies, reached through the same helper. */
class FakeBand implements FrontmanBand {
  t = 0;
  struck: { role: Role; gain: number; ev: ChartEvent }[] = [];
  playing = new Set<Role>();

  anchor(): { step: number; time: number; stepDuration: number; swing: number } {
    const step = Math.floor(this.t / STEP_S);
    return { step, time: step * STEP_S, stepDuration: STEP_S, swing: SOUNDSET.swing };
  }
  latencyS(): number {
    return 0;
  }
  strike(role: Role, ev: ChartEvent, gainMul: number): void {
    this.struck.push({ role, gain: gainMul, ev });
  }
  syncChart(): void {
    // The shell composes chart state from three reasons; a harness has none of
    // them, so what a voice would sound like is measured in section 6 instead.
  }
}

/** `walk` matters more than it looks. A world whose player walks right for a full
 *  minute travels ten thousand units, and practice targets planted once at the
 *  start are simply left behind — which is what made the first pass of section 3
 *  report 94 damage for a hand landing 72 clean hits. Sections that plant targets
 *  once and measure over minutes stand still; sections that need a heading walk. */
function makeWorld(seed = 0xf0f0, walk = true): RunWorld {
  return new RunWorld(
    { width: 1280, height: 800 },
    { onLevelUp: noop, onDeath: noop, onVictory: noop, onHit: noop },
    {
      scripted: false,
      fx: false,
      rng: mulberry32(seed),
      control: () => (walk ? { x: 1, y: 0 } : { x: 0, y: 0 }),
    },
  );
}

/** A ring of tanky bodies. 150 hp, not 10: `damageByRole` credits EFFECTIVE
 *  damage, so against a zombie every hit overkills and the number stops being
 *  damage and becomes a body count (#273's finding, and it applies to every
 *  measurement below). */
function ring(world: RunWorld, count = 10, dist = 70): void {
  const p = world.player;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    world.spawnEnemyAt('greenMudman', p.x + Math.cos(a) * dist, p.y + Math.sin(a) * dist);
  }
}

const lines: string[] = [];
const say = (s = ''): void => {
  lines.push(s);
  console.log(s);
};
let failures = 0;
function check(label: string, ok: boolean, detail = ''): void {
  if (!ok) failures += 1;
  say(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
}

// ---------------------------------------------------------------------------
say('==== 1. the placement window ====');
say();
// Press at a series of offsets from a tick and check the verdict flips exactly at
// the window edge. The feel is forced to STRAIGHT so the ticks are the even steps.
{
  const band = new FakeBand();
  const fm = new Frontman(band);
  fm.reset(() => 0); // FEELS[0] = STRAIGHT
  const world = makeWorld();
  world.addWeapon('kick', 4);
  fm.micRole = 'kick';
  say(`  feel: ${fm.feel.name}, ticks ${fm.feel.ticks.join(',')}, window ±${Math.round(fm.windowS * 1000)}ms`);

  // A FRESH BAR PER PRESS. The budget refills on a bar line and a tick can only
  // be claimed once inside a bar, so reusing one bar measures the budget rather
  // than the window — which is what the first version of this did.
  const edgeMs = Math.round(fm.windowS * 1000);
  const results: string[] = [];
  let bar = 0;
  for (const offsetMs of [0, 20, edgeMs - 1, edgeMs + 2, 90, -20, -(edgeMs - 1), -(edgeMs + 2), -90]) {
    bar += 1;
    const barStart = bar * STEPS_PER_BAR;
    fm.onBarLine(barStart, world, 0);
    band.t = (barStart + 4) * STEP_S + offsetMs / 1000;
    const r = fm.place(world, band.t, world.tiers);
    const want = Math.abs(offsetMs) <= edgeMs ? 'landed' : 'loose';
    results.push(`${offsetMs >= 0 ? '+' : ''}${offsetMs}ms=${r.kind}`);
    if (r.kind !== want) failures += 1;
  }
  say(`  ${results.join('  ')}`);
  check('verdict flips at the window edge, both sides', results.every((r) => {
    const [offset, kind] = r.split('=');
    const ms = Math.abs(Number(offset.replace('ms', '')));
    return (ms <= edgeMs) === (kind === 'landed');
  }), results.join(' '));

  // The shuffle: the offbeat 8th is heard 10% of a step late, so a press right ON
  // the arithmetic step should read EARLY by that much rather than perfect.
  const swingBar = (bar + 1) * STEPS_PER_BAR;
  fm.onBarLine(swingBar, world, 0);
  band.t = (swingBar + 6) * STEP_S;
  const swung = fm.place(world, band.t, world.tiers);
  const swungMs = swung.kind === 'landed' || swung.kind === 'loose' ? swung.offsetMs : 0;
  check(
    'the laid-back place is measured where it is HEARD, not where the arithmetic is',
    swungMs < 0 && Math.abs(swungMs + SOUNDSET.swing * STEP_S * 1000) < 3,
    `${swungMs}ms, expected ${-Math.round(SOUNDSET.swing * STEP_S * 1000)}ms`,
  );
}

// ---------------------------------------------------------------------------
say();
say('==== 2. the budget and the one-per-tick rule ====');
say();
{
  const band = new FakeBand();
  const fm = new Frontman(band);
  fm.reset(() => 0);
  const world = makeWorld();
  world.addWeapon('kick', 4);
  fm.micRole = 'kick';
  fm.onBarLine(0, world, 0);
  const total = fm.readout(0, 0).placementsTotal;
  const kinds: string[] = [];
  // Six presses, all on the same tick.
  for (let i = 0; i < 6; i++) {
    band.t = 4 * STEP_S;
    kinds.push(fm.place(world, band.t, world.tiers).kind);
  }
  say(`  budget ${total}; six presses on one tick -> ${kinds.join(', ')}`);
  check('the first press on a tick lands', kinds[0] === 'landed');
  check('every later press on the SAME tick is refused and costs nothing',
    kinds.slice(1).every((k) => k === 'taken'), kinds.join(','));

  // Spread across distinct ticks: the budget is what stops you, not the grid.
  fm.onBarLine(STEPS_PER_BAR, world, 0);
  const spread: string[] = [];
  for (const tick of [0, 2, 4, 6, 8, 10]) {
    band.t = STEPS_PER_BAR * STEP_S + tick * STEP_S;
    spread.push(fm.place(world, band.t, world.tiers).kind);
  }
  say(`  six presses on six ticks -> ${spread.join(', ')}`);
  check(`the budget runs out after ${total}`,
    spread.filter((k) => k === 'landed').length === total &&
    spread.slice(total).every((k) => k === 'spent'), spread.join(','));
}

// ---------------------------------------------------------------------------
say();
say('==== 3. THE KILL CRITERION, priced: mashing against placing ====');
say();
// "If hammering off-grid gets close enough to landing on-grid, the skill is not
// real and the grid is decoration." So: same weapon, same bars, two hands. The
// placer aims at ticks; the masher hammers with no idea where the grid is.
//
// MEASURED AGAINST PRACTICE TARGETS, NOT BODIES. `damageByRole` credits
// Math.min(hp, amount), so against ordinary enemies both hands overkill and both
// read the same — #273's finding, and the first version of this walked straight
// into it and reported ×1.15 for a mechanic that is actually ×1.9. A dummy
// absorbs exactly what it is dealt and refills, so the number is damage rather
// than a body count.
{
  function dummies(world: RunWorld): void {
    const p = world.player;
    for (const dist of [40, 90, 150, 240]) {
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2 + dist;
        world.spawnEnemyAt('dummy', p.x + Math.cos(a) * dist, p.y + Math.sin(a) * dist);
      }
    }
  }
  function hand(label: string, bars: number, mashHz: number, jitter: number): { units: number; dmg: number } {
    const band = new FakeBand();
    const fm = new Frontman(band);
    fm.reset(() => 0);
    fm.layers.cue = false; // section 4 measures those; this is the hand alone
    fm.layers.charge = false;
    const world = makeWorld(0xf0f0, false); // stand still: the targets are planted once
    // THE CLAP, not the kick. The clap's fire() damages everything in reach on
    // the spot, so its damage is per-trigger and `damageMul` reaches the world
    // intact. The kick keeps ONE floor strip alive at a time and re-arms it, so
    // three fires a bar deal nearly the same total however hard each one hit —
    // which is what made the first version of this read x1.15 for a mechanic that
    // is not x1.15. A weapon's shape is a weapon property, not a mechanic one.
    world.addWeapon('clap', WEAPON_MAX_LEVEL);
    fm.micRole = 'clap';
    world.frontmanMicRole = 'clap';
    dummies(world);
    const rng = mulberry32(0xabcd);
    let landed = 0;
    let loose = 0;
    let units = 0;
    for (let bar = 0; bar < bars; bar++) {
      const barStart = bar * STEPS_PER_BAR;
      band.t = barStart * STEP_S;
      fm.onBarLine(barStart, world, 0);
      const presses = mashHz === 0
        ? fm.feel.ticks.map((tick) => (barStart + tick) * STEP_S)
        // Hammering: a fast rate with a DRIFTING phase. A constant phase is the
        // wrong model and flatters the masher — at 8 Hz against 3.7 ticks a second
        // it locks into a fixed two-out-of-three and never drops the streak.
        : Array.from({ length: Math.round(mashHz * BAR_S) },
            (_, i) => barStart * STEP_S + i / mashHz + rng() * jitter);
      for (const at of presses) {
        band.t = at;
        const r = fm.place(world, band.t, world.tiers);
        if (r.kind === 'landed') landed += 1;
        else if (r.kind === 'loose') loose += 1;
        if (r.kind === 'landed' || r.kind === 'loose') units += r.damageMul;
      }
      for (let s = 0; s < Math.round(BAR_S / SIM_DT); s++) world.update(SIM_DT);
    }
    const dmg = world.damageByRole.clap ?? 0;
    const rate = landed + loose > 0 ? Math.round((landed / (landed + loose)) * 100) : 0;
    say(`  ${label.padEnd(14)} ${String(landed).padStart(3)} landed, ${String(loose).padStart(3)} loose (${String(rate).padStart(3)}%)`
      + ` -> ${units.toFixed(1).padStart(7)} hand units, ${Math.round(dmg).toString().padStart(6)} damage`);
    return { units, dmg };
  }
  const placed = hand('placing', 24, 0, 0);
  const mashes = [
    hand('mashing 8/s', 24, 8, 1 / 8),
    hand('mashing 16/s', 24, 16, 1 / 16),
    hand('mashing 4/s', 24, 4, 1 / 4),
  ];
  const bestUnits = Math.max(...mashes.map((m) => m.units));
  const bestDmg = Math.max(...mashes.map((m) => m.dmg));
  const unitRatio = bestUnits > 0 ? placed.units / bestUnits : Infinity;
  const dmgRatio = bestDmg > 0 ? placed.dmg / bestDmg : Infinity;
  say(`  placing is ×${unitRatio.toFixed(2)} the best mash in hand units, ×${dmgRatio.toFixed(2)} in damage landed`);
  check('placing beats mashing by a margin the player can feel (target ≥1.6×)',
    unitRatio >= 1.6, `×${unitRatio.toFixed(2)}`);
  check('and the margin survives contact with a real weapon',
    dmgRatio >= 1.5, `×${dmgRatio.toFixed(2)}`);
}

// ---------------------------------------------------------------------------
say();
say('==== 4. the two synergies ====');
say();
{
  // THE CUE: mark, then let the band's downbeat cash it.
  const band = new FakeBand();
  const fm = new Frontman(band);
  fm.reset(() => 0);
  fm.layers.charge = false;
  const world = makeWorld();
  world.addWeapon('kick', 4);
  fm.micRole = 'kick';
  world.frontmanMicRole = 'kick';
  ring(world, 6, 60);
  world.update(SIM_DT); // build the spatial hash the mark queries
  fm.onBarLine(0, world, 4);
  band.t = 4 * STEP_S;
  fm.place(world, band.t, world.tiers);
  const marked = world.enemies.filter((e) => e.cueT > 0).length;
  const before = world.enemies.reduce((sum, e) => sum + e.hp, 0);
  const cashed = fm.onBarLine(STEPS_PER_BAR, world, 4);
  const after = world.enemies.reduce((sum, e) => sum + e.hp, 0);
  say(`  cue: ${marked} bodies marked, ${cashed.cued} cashed on the downbeat, ${Math.round(before - after)} damage`);
  check('a landed placement marks bodies', marked > 0, `${marked}`);
  check('the band\'s downbeat cashes them', cashed.cued === marked && before - after > 0);
  check('the marks clear once cashed', world.enemies.every((e) => e.cueT <= 0));

  // With no band there is nothing to cash it. That is the point of the axis.
  fm.onBarLine(STEPS_PER_BAR * 2, world, 4);
  band.t = (STEPS_PER_BAR * 2 + 4) * STEP_S;
  fm.place(world, band.t, world.tiers);
  const soloCash = fm.onBarLine(STEPS_PER_BAR * 3, world, 0);
  check('a soloist\'s cue pays nothing — the synergy needs a band', soloCash.cued === 0);

  // THE CHARGE: the band loads, the hand spends.
  const w2 = makeWorld();
  w2.frontmanCharge = true;
  w2.addWeapon('kick', WEAPON_MAX_LEVEL);
  const fm2 = new Frontman(new FakeBand());
  fm2.reset(() => 0);
  fm2.micRole = 'chord'; // the hand holds something else; the kick is the band
  w2.addWeapon('chord', 4);
  w2.frontmanMicRole = 'chord';
  ring(w2, 8, 60);
  for (let i = 0; i < 6; i++) {
    w2.fireTrigger({ role: 'kick', time: 0, velocity: 0.9, step: i * 4 });
    for (let s = 0; s < 6; s++) w2.update(SIM_DT);
  }
  const pipped = w2.enemies.filter((e) => !e.dead && e.charge > 0);
  const pips = pipped.reduce((sum, e) => sum + e.charge, 0);
  say(`  charge: the band loaded ${pips} pips across ${pipped.length} bodies`);
  check('band triggers stack pips', pips > 0, `${pips}`);
  const spent = w2.spendCharge(w2.player.x, w2.player.y, 400, 9, 'chord');
  say(`  the hand spent ${spent} of them`);
  check('a placement spends the pips in reach', spent > 0 && spent <= pips, `${spent}/${pips}`);
  check('spent pips are gone', w2.enemies.every((e) => e.dead || e.charge === 0));

  // The hand must not load the magazine it fires.
  const w3 = makeWorld();
  w3.frontmanCharge = true;
  w3.addWeapon('kick', WEAPON_MAX_LEVEL);
  w3.frontmanMicRole = 'kick'; // the kick is in the player's HAND here
  ring(w3, 6, 60);
  w3.update(SIM_DT);
  w3.handFire('kick', 3);
  for (let s = 0; s < 6; s++) w3.update(SIM_DT);
  const selfPips = w3.enemies.reduce((sum, e) => sum + (e.dead ? 0 : e.charge), 0);
  check('a HAND hit stacks no charge — the synergy has to cross the axis', selfPips === 0, `${selfPips}`);
}

// ---------------------------------------------------------------------------
say();
say('==== 5. solo, and the re-entry ====');
say();
{
  const band = new FakeBand();
  const fm = new Frontman(band);
  fm.reset(() => 0);
  const world = makeWorld();
  for (const role of ['kick', 'bass', 'hat', 'chord'] as Role[]) world.addWeapon(role, 4);
  fm.micRole = 'chord';

  check('the drop is gated on there being something worth stripping',
    !fm.soloReady(2) && fm.soloMeter === 0, 'meter empty, 2 voices');
  // Fill the meter by playing well, which is the only way it fills.
  let bars = 0;
  while (fm.soloMeter < 100 && bars < 400) {
    const barStart = bars * STEPS_PER_BAR;
    fm.onBarLine(barStart, world, 3);
    for (const tick of fm.feel.ticks) {
      band.t = (barStart + tick) * STEP_S;
      fm.place(world, band.t, world.tiers);
    }
    bars += 1;
  }
  say(`  the meter fills in ${bars} bars of clean playing (${(bars * BAR_S).toFixed(0)}s)`);
  check('a clean hand can bank a solo inside a run', bars < 60, `${bars} bars`);
  check('and it is ready once there are voices to strip', fm.soloReady(3));

  const armed = fm.armSolo(3);
  const started = fm.onBarLine(bars * STEPS_PER_BAR, world, 3);
  check('the solo arms and starts on a bar line', armed && started.soloStarted);
  check('while soloing the hand hits harder and gets more places',
    fm.handMul > 3 && fm.readout(0, 0).placementsTotal > 3,
    `×${fm.handMul.toFixed(1)}, ${fm.readout(0, 0).placementsTotal} places`);

  // Do the job down in the valley.
  let soloLanded = 0;
  for (let b = 0; b < SOLO.bars; b++) {
    const barStart = (bars + b) * STEPS_PER_BAR;
    if (b > 0) fm.onBarLine(barStart, world, 0);
    for (const tick of fm.feel.ticks) {
      band.t = (barStart + tick) * STEP_S;
      if (fm.place(world, band.t, world.tiers).kind === 'landed') soloLanded += 1;
    }
  }
  ring(world, 12, 90);
  world.update(SIM_DT);
  const hpBefore = world.enemies.reduce((s, e) => s + e.hp, 0);
  const out = fm.onBarLine((bars + SOLO.bars) * STEPS_PER_BAR, world, 0);
  const hpAfter = world.enemies.reduce((s, e) => s + e.hp, 0);
  say(`  ${soloLanded} placed down in the valley -> re-entry ${Math.round(out.reentry?.damage ?? 0)} to everything on screen`);
  check('the band comes back on the phrase line', out.reentry !== null);
  check('the re-entry is SIZED BY THE JOB, not flat',
    (out.reentry?.landed ?? 0) === soloLanded && (out.reentry?.damage ?? 0) > 0);
  check('and it lands on the field', hpBefore - hpAfter > 0, `${Math.round(hpBefore - hpAfter)} hp`);
  check('the solo is over', !fm.soloing);

  const fillBefore = band.struck.length;
  fm.fill(['kick', 'bass', 'hat'], world.tiers, soloLanded);
  say(`  the fill adds ${band.struck.length - fillBefore} triggers on the return bar`);
  check('the return is AUDIBLE as well as lethal', band.struck.length > fillBefore);
}

// ---------------------------------------------------------------------------
say();
say('==== 6. DENSITY along the band <-> hands axis ====');
say();
// The hard floor (#256): a run's density must fall at least once BECAUSE THE
// PLAYER CHOSE IT. `docs/palette-control/` measured 4.00 -> 96.00 triggers a bar
// and never once falling. Here is what each position this stack can actually
// reach is worth, in the same unit.
//
// THE MIC HOLDS ONE WEAPON. That is a design call, not an oversight (see
// docs/frontman.md), and this table is what makes its consequence legible: taking
// ONE instrument off a five-piece band is a small change to the arrangement, and
// a hand with places to spare can put more triggers back than it took away. The
// arrangement-level fall in this stack comes from SOLO, not from the mic.
{
  const BUILD5: Role[] = ['kick', 'bass', 'hat', 'chord', 'lead'];
  /** Triggers a bar a set of charts produces at a given level. */
  function chartTriggers(roles: readonly Role[], level: number): number {
    let total = 0;
    for (const role of roles) {
      const chart = getChart(role, chartStageForLevel(level));
      total += chart.events.length / chart.bars;
    }
    return total;
  }
  const full = chartTriggers(BUILD5, WEAPON_MAX_LEVEL);
  const rows: [string, number][] = [['all band — nothing at the mic', full]];
  for (const places of [3, 5, 8]) {
    rows.push([`one at the mic, ${places} places a bar`, full - chartTriggers(['lead'], WEAPON_MAX_LEVEL) + places]);
  }
  rows.push(['SOLO, 3 places a bar', 3]);
  rows.push(['SOLO, 8 places a bar (maxed hand)', 8]);
  const width = Math.max(...rows.map(([label]) => label.length));
  for (const [label, n] of rows) {
    say(`  ${label.padEnd(width)}  ${n.toFixed(2).padStart(6)} triggers/bar  ${String(Math.round((n / full) * 100)).padStart(3)}% of full`);
  }

  say();
  say('  WHICH voice you take is what decides how far the arrangement thins:');
  const perRole = BUILD5
    .map((role) => [role, chartTriggers([role], WEAPON_MAX_LEVEL)] as const)
    .sort((a, b) => b[1] - a[1]);
  for (const [role, own] of perRole) {
    const left = full - own;
    say(`    take the ${role.padEnd(6)} -> band drops to ${left.toFixed(2).padStart(6)} (${String(Math.round((left / full) * 100)).padStart(3)}%), your hand owes ${own.toFixed(2)} a bar to break even`);
  }
  const busiest = perRole[0];
  const sparsest = perRole[perRole.length - 1];

  check('SOLO is a real arrangement-level fall the player chose',
    3 < full * 0.15, `solo floor 3.00 vs full band ${full.toFixed(2)}`);
  check('and the mic on its own is NOT — this is the stack\'s honest weak point',
    full - sparsest[1] + 8 >= full,
    `taking the ${sparsest[0]} and spending 8 places is ${(full - sparsest[1] + 8).toFixed(2)} against ${full.toFixed(2)}`);
  check('but WHICH voice you take is a real decision, ' +
    `${(busiest[1] / sparsest[1]).toFixed(1)}x between the busiest and the sparsest`,
    busiest[1] / sparsest[1] >= 1.5, `${busiest[0]} ${busiest[1]} vs ${sparsest[0]} ${sparsest[1]}`);
}

// ---------------------------------------------------------------------------
say();
say('==== 7. a full run\'s decision stream ====');
say();
// #265 measured the stripped base running dry at 13:27 / 14:42: five weapons at
// VIII and every level-up after that an Encore. The mic's 25 ranks are what this
// stack has to fill that with, so the question is whether they last.
{
  for (const seed of [0xf00d, 0xbeef]) {
    const band = new FakeBand();
    const fm = new Frontman(band);
    fm.reset(mulberry32(seed));
    fm.layers.call = true; // so the order pick is in the stream too
    const world = makeWorld(seed);
    const rng = mulberry32(seed ^ 0x1234);
    let weaponPicks = 0;
    let micPicks = 0;
    let orderPicks = 0;
    let encores = 0;
    let dryAtS: number | null = null;
    // Level-up pace: the baseline run reached level 29 by 13:17, so ~2.2 levels a
    // minute early tapering later. Rather than re-simulate XP, walk the same
    // number of decisions the base's own measurement produced over 30 minutes.
    const DECISIONS = 60;
    for (let i = 0; i < DECISIONS; i++) {
      const timeS = (i / DECISIONS) * 1800;
      const offers = rollOffers({
        tiers: world.tiers,
        pendingTiers: new Map(),
        rng,
        timeS,
        micStats: fm.openStats(),
        needsOrder: fm.order === null,
      });
      const pick = offers[0];
      if (pick.kind === 'weapon') {
        weaponPicks += 1;
        world.addWeapon(pick.role, Math.min(WEAPON_MAX_LEVEL, (world.tiers.get(pick.role) ?? 0) + 1));
      } else if (pick.kind === 'mic') {
        micPicks += 1;
        fm.rankUp(pick.stat);
      } else if (pick.kind === 'order') {
        orderPicks += 1;
        fm.order = pick.order;
      } else {
        encores += 1;
        if (dryAtS === null) dryAtS = timeS;
      }
    }
    const dry = dryAtS === null
      ? 'never — the stream runs to 30:00'
      : `${Math.floor(dryAtS / 60)}:${String(Math.round(dryAtS % 60)).padStart(2, '0')}`;
    say(`  seed ${seed.toString(16)}: ${weaponPicks} weapon, ${micPicks} mic, ${orderPicks} order, ${encores} encore — runs dry at ${dry}`);
    check(`seed ${seed.toString(16)}: the mic fills the base's minute-fourteen hole`,
      dryAtS === null || dryAtS > 14 * 60, dry);
  }
  const totalRanks = MIC_STATS.length * MIC_MAX_RANK;
  say(`  the mic holds ${totalRanks} ranks against the band's ${5 * WEAPON_MAX_LEVEL} weapon levels`);
}

say();
say(failures === 0
  ? `==== all checks passed ====`
  : `==== ${failures} CHECK(S) FAILED ====`);
if (failures > 0) process.exitCode = 1;
