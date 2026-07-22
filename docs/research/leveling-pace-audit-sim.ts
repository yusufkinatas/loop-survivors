// Headless leveling-pace audit for issue #198.
// Drives the real RunWorld with the real 122BPM chart trigger schedule, the
// real kiter bot, and the real pick economy. No rendering, no audio.
import { RunWorld, type RunEvents } from '../../src/game/run';
import { SOUNDSET_LADDERS } from '../../src/audio/ladders/house';
import { createGreedyMover } from '../../src/game/auto-move';
import { mulberry32 } from '../../src/game/rng';
import { ROLES, type Role } from '../../src/audio/kits';
import { ITEM_IDS } from '../../src/game/items';
import { weaponTiers } from '../../src/game/weapons';
import { SIM_DT } from '../../src/game/timing';

const BPM = 122;
const STEP_S = 60 / BPM / 4; // 16th-note grid
const RUN_S = Number(process.env.RUN_S ?? 1800);

interface MinuteRow {
  min: number; level: number; kills: number; alive: number;
  xpCollected: number; xpOnFloor: number;
}

interface SimResult {
  seed: number; damageScale: number;
  minutes: MinuteRow[];
  diedAtS: number | null;
  finalLevel: number; kills: number; xpCollected: number;
}

function scaleAllWeaponDamage(factor: number): () => void {
  const originals: Array<{ conf: { damage: number }; damage: number }> = [];
  for (const role of ROLES) {
    const tiers = weaponTiers(role);
    if (!tiers) continue;
    for (const conf of tiers) {
      const c = conf as unknown as { damage: number };
      originals.push({ conf: c, damage: c.damage });
      c.damage = c.damage * factor;
    }
  }
  return () => { for (const o of originals) o.conf.damage = o.damage; };
}

function runSim(seed: number, damageScale: number, quiet = true): SimResult {
  const restore = scaleAllWeaponDamage(damageScale);
  const rng = mulberry32(seed);
  let pendingPicks = 0;
  let died: number | null = null;
  let won = false;
  let xpCollected = 0;
  const pendingChests: number[] = [];

  const events: RunEvents = {
    onLevelUp: () => { pendingPicks += 1; },
    onDeath: () => { died = died ?? world.timeS; },
    onVictory: () => { won = true; },
    onHit: () => {},
    onChest: () => { pendingChests.push(1); },
    onGemCollected: (xp) => { xpCollected += xp; },
  };

  // Farmer bot: dodge only close threats, otherwise collect gems and stay
  // at weapon range — closer to how a human plays than the fleeing kiter.
  // Aggressive farmer with HP awareness: at healthy HP it collects gems and
  // stays at weapon range, dodging only close contact; below 45% HP it hands
  // control to the shipped kiter until healed. Both shipped auto-movers alone
  // out-run the horde and starve melee-range weapons, which is not how a
  // human plays.
  const kiter = createGreedyMover();
  const farmer = (): { x: number; y: number } => {
    const p = world.player;
    if (p.hp < world.playerMaxHp * 0.6) return kiter(world);
    let nearest: { x: number; y: number } | null = null;
    let nd = Infinity;
    for (const e of world.enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d < nd) { nd = d; nearest = e; }
    }
    if (nearest && nd < 80) {
      let fx = 0, fy = 0;
      for (const e of world.enemies) {
        if (e.dead) continue;
        const dx = p.x - e.x, dy = p.y - e.y;
        const d = Math.hypot(dx, dy);
        if (d < 150 && d > 0.01) { const w = 1 - d / 150; fx += (dx / d) * w; fy += (dy / d) * w; }
      }
      const n = Math.hypot(fx, fy) || 1;
      return { x: fx / n, y: fy / n };
    }
    // Value-aware gem seeking: prefer big gems, but never ignore the floor —
    // with no cap, the overflow gem (which absorbs everything past maxGems)
    // is always eventually fetched, as a human would.
    let gx = 0, gy = 0, best = -Infinity, gd = Infinity;
    for (const g of world.gems) {
      const d = Math.hypot(g.x - p.x, g.y - p.y);
      const score = g.xp / (d + 100);
      if (score > best) { best = score; gd = d; gx = g.x; gy = g.y; }
    }
    if (best > -Infinity) { const d = gd || 1; return { x: (gx - p.x) / d, y: (gy - p.y) / d }; }
    if (nearest && nd > 90) { return { x: (nearest.x - p.x) / nd, y: (nearest.y - p.y) / nd }; }
    return { x: 0, y: 0 };
  };
  const world: RunWorld = new RunWorld({ width: 1280, height: 720 }, events, {
    rng,
    control: farmer,
    fx: false,
  });
  world.invincible = true;

  const unlockedRoles = new Set(ROLES);
  const unlockedItems = new Set(ITEM_IDS);

  // Opening hire: first card of the real starting roll.
  world.addWeapon('kick', 1);

  // Deterministic representative build: five bot-usable weapons to max tier,
  // then five passives to max level, then heal encores. Removes pick-RNG
  // noise so damage scale is the only variable between runs.
  const buildScript: Array<{ kind: 'weapon'; role: Role; tier: number } | { kind: 'item'; item: (typeof ITEM_IDS)[number]; tier: number }> = [];
  {
    const roles: Role[] = ['snare', 'clap', 'bass', 'chord'];
    for (const role of roles) buildScript.push({ kind: 'weapon', role, tier: 1 });
    for (let tier = 2; tier <= 4; tier++) {
      for (const role of ['kick', ...roles] as Role[]) buildScript.push({ kind: 'weapon', role, tier });
    }
    const chosenItems = ['heavyAmp', 'fastForward', 'wideLens', 'highTops', 'magnetLanyard'] as const;
    for (let lvl = 1; lvl <= 5; lvl++) {
      for (const item of chosenItems) buildScript.push({ kind: 'item', item, tier: lvl });
    }
  }
  // STRETCH=1: emulate VS's 8-level shape — every weapon step costs two
  // picks (a heal-encore filler precedes it), so weapon power-per-pick
  // halves while endpoints stay identical.
  if (process.env.STRETCH) {
    for (let k = buildScript.length - 1; k >= 0; k--) {
      if (buildScript[k].kind === 'weapon') buildScript.splice(k, 0, { kind: 'filler' } as any);
    }
  }
  let buildIdx = 0;

  const applyPicks = (): void => {
    while (pendingPicks > 0) {
      pendingPicks -= 1;
      const pick = buildScript[buildIdx];
      if (pick) {
        buildIdx += 1;
        if (pick.kind === 'weapon') world.addWeapon(pick.role, pick.tier);
        else if (pick.kind === 'item') world.addItem(pick.item, pick.tier);
        else world.applyEncoreChoice('heal');
      } else {
        world.applyEncoreChoice('heal');
      }
    }
    while (pendingChests.length > 0) {
      pendingChests.pop();
      // Approximation of the chest ceremony: evolution if one is ready,
      // otherwise the next build-script step (the slot machine's floor payout).
      const evolutions = world.eligibleEvolutions();
      if (evolutions.length > 0) { world.evolve(evolutions[0].role); continue; }
      // A chest grants the next REAL step (VS chests give real levels).
      while (buildScript[buildIdx] && (buildScript[buildIdx] as any).kind === 'filler') buildIdx += 1;
      const pick = buildScript[buildIdx];
      if (pick) {
        buildIdx += 1;
        if (pick.kind === 'weapon') world.addWeapon(pick.role, pick.tier);
        else if (pick.kind === 'item') world.addItem(pick.item, pick.tier);
      }
    }
  };

  const minutes: MinuteRow[] = [];
  let nextStepIdx = 0;

  for (let tick = 0; tick * SIM_DT < RUN_S; tick++) {
    const t = tick * SIM_DT;
    if (died !== null || won) break;

    // Fire every chart trigger due before this tick's end, per owned role.
    const tEnd = t + SIM_DT;
    while (nextStepIdx * STEP_S < tEnd) {
      const stepTime = nextStepIdx * STEP_S;
      for (const [role, tier] of world.tiers) {
        const ladder = SOUNDSET_LADDERS[role];
        if (!ladder) continue;
        const chart = ladder[Math.max(0, Math.min(3, tier - 1))];
        const loopSteps = chart.bars * 16;
        const step = nextStepIdx % loopSteps;
        for (const ev of chart.events) {
          if (ev.step !== step) continue;
          world.fireTrigger({ role, time: stepTime, velocity: ev.velocity, step: ev.step, variant: ev.variant, note: ev.note });
        }
      }
      nextStepIdx += 1;
    }

    world.update(SIM_DT);
    if (pendingPicks > 0 || pendingChests.length > 0) applyPicks();

    if (tick % (60 * 60) === 0 && tick > 0) {
      const min = Math.round(t / 60);
      let floorXp = 0;
      for (const g of world.gems) floorXp += g.xp;
      minutes.push({
        min, level: world.level, kills: world.kills,
        alive: world.enemies.filter((e) => !e.dead).length,
        xpCollected: Math.round(xpCollected), xpOnFloor: Math.round(floorXp),
      });
      if (!quiet) console.log(`  m${min}: L${world.level} kills=${world.kills} alive=${minutes[minutes.length - 1].alive}`, JSON.stringify(world.damageByRole), JSON.stringify([...world.tiers]));
    }
  }

  restore();
  return {
    seed, damageScale, minutes,
    diedAtS: died,
    finalLevel: world.level, kills: world.kills, xpCollected: Math.round(xpCollected),
  };
}

const scales = process.argv[2] ? process.argv[2].split(',').map(Number) : [1];
const seeds = process.argv[3] ? process.argv[3].split(',').map(Number) : [1234];

for (const scale of scales) {
  for (const seed of seeds) {
    const t0 = Date.now();
    const r = runSim(seed, scale);
    const lvl = (m: number) => r.minutes.find((x) => x.min === m)?.level ?? '-';
    const row = [5, 10, 15, 20, 25, 29].map((m) => `m${m}:L${lvl(m)}`).join(' ');
    console.log(
      `scale=${scale} seed=${seed} → ${row} final=L${r.finalLevel} kills=${r.kills} ` +
      `xp=${r.xpCollected} died=${r.diedAtS !== null ? Math.round(r.diedAtS) + 's' : 'no'} (${((Date.now() - t0) / 1000).toFixed(1)}s)`,
    );
    for (const m of r.minutes) {
      console.log(`   m${String(m.min).padStart(2)} L${String(m.level).padStart(2)} kills=${String(m.kills).padStart(5)} alive=${String(m.alive).padStart(3)} xpGot=${m.xpCollected} floor=${m.xpOnFloor}`);
    }
  }
}
