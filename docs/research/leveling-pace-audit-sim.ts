// Headless leveling-pace harness. Written for issue #198 (the baseline audit),
// rebuilt for #213 (the post-rescale re-measurement).
//
// It drives the real RunWorld with the real 122 BPM chart trigger schedule, the
// real Mad Forest wave table, the real level-up offer roll and the real chest
// payout. No rendering, no audio.
//
// WHAT THIS HARNESS DELIBERATELY DOES NOT DO: invent a build. The pre-#213
// version ran a hand-written build script (every weapon to max, then the
// passives) that ignored what the game actually offers. That was defensible at
// 4 tiers — the script finished a weapon in 4 picks — but the 8-level rescale
// (#226) pushed the first passive out to pick ~40, so the bot ran most of a
// 30-minute run with no Magnet and left a third of the run's XP on the floor.
// A build order the offer roll would never produce is not a measurement of the
// game's pace; it is a measurement of the script.
//
// So the bot now plays the real economy: rollOffers deals three real cards, a
// documented priority policy picks one of them (POLICY below), and chests pay
// what rollChestDrops pays. Nothing here decides what the player is allowed to
// be offered.
//
//   npx tsx docs/research/leveling-pace-audit-sim.ts <damageScales> <seeds>
//   e.g.  npx tsx docs/research/leveling-pace-audit-sim.ts 1 1234,42,777
//         POLICY=weapons npx tsx docs/research/leveling-pace-audit-sim.ts 1 1234
//
// This file is also run against the PRE-RESCALE tree (branch
// research/leveling-pace-audit, commit 5adf261) to re-measure the "before"
// number with the same bot — the only way the two are comparable. Everything
// version-dependent is feature-detected rather than assumed; see WEAPON_LEVELS
// and chartStageForLevel below.
import { RunWorld, type RunEvents } from '../../src/game/run';
import { SOUNDSET_LADDERS } from '../../src/audio/ladders/house';
import { TIER_COUNT } from '../../src/audio/charts';
import { createGreedyMover } from '../../src/game/auto-move';
import { mulberry32, type Rng } from '../../src/game/rng';
import { ROLES, type Role } from '../../src/audio/kits';
import {
  ITEM_IDS,
  eligibleEvolutions,
  itemLevel,
  itemMaxLevel,
  type ItemId,
} from '../../src/game/items';
import { weaponTiers } from '../../src/game/weapons';
import { rollOffers } from '../../src/game/picks';
import { BUILD, CHEST } from '../../src/game/config';
import { SIM_DT } from '../../src/game/timing';

const BPM = 122;
const STEP_S = 60 / BPM / 4; // 16th-note grid
const RUN_S = Number(process.env.RUN_S ?? 1800);

/** How far a weapon levels in THIS tree: 8 after #226, 4 before it. */
const WEAPON_LEVELS = Math.max(...ROLES.map((role) => weaponTiers(role)?.length ?? 0));

/** Weapon level -> authored chart stage, i.e. which trigger density fires.
 *
 *  THIS WAS THE HARNESS'S WORST BUG. The pre-#213 version indexed the ladder
 *  with `min(3, level - 1)`, which was correct only while levels and stages
 *  were the same four rungs. After the rescale it handed a level-3 weapon
 *  stage 3 and a level-5 weapon stage 4 — up to triple the real trigger
 *  density through the whole mid-game (hat fires 4/bar at level 3, not 12).
 *  Every post-rescale number measured before this fix flattered the build.
 *
 *  The shipped rule is imported when it exists so this cannot drift again; the
 *  fallback is the identity mapping, which is exactly the rule of the 4-tier
 *  tree where src/game/weapons/levels.ts does not exist yet. */
let chartStageForLevel = (level: number): number =>
  Math.max(1, Math.min(TIER_COUNT, Math.ceil((Math.floor(level) * TIER_COUNT) / WEAPON_LEVELS)));
try {
  ({ chartStageForLevel } = await import('../../src/game/weapons/levels'));
} catch {
  // Pre-#226 tree: no levels.ts, and the fallback above IS that tree's rule.
}

/** How the bot chooses among the three cards it is dealt.
 *  - `human`   (default) the policy documented on pickPriority below.
 *  - `weapons` weapon-greedy: passives only when no weapon card is on screen.
 *  - `passives` passive-greedy once the band is hired.
 *  The three exist so the verdict can be shown not to be a policy artifact. */
type Policy = 'human' | 'weapons' | 'passives';
const POLICY = (process.env.POLICY ?? 'human') as Policy;

interface MinuteRow {
  min: number; level: number; kills: number; alive: number;
  xpCollected: number; xpOnFloor: number;
}

interface SimResult {
  seed: number; damageScale: number;
  minutes: MinuteRow[];
  diedAtS: number | null;
  finalLevel: number; kills: number; xpCollected: number; xpOnFloor: number;
  /** Wall-clock second the player REACHED each of these levels, or null. */
  reachedAtS: Map<number, number>;
  chests: number; chestHits: number; evolutions: number;
  /** Stage Lights actually broken, and the run-seconds each Stage Magnet drop
   *  landed at — the two numbers the new drop economy lives or dies on. */
  lightsBroken: number; magnetAtS: number[];
  build: string;
}

const MILESTONE_LEVELS = [10, 20, 21, 40, 41];

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

type Card =
  | { kind: 'weapon'; role: Role; tier: number }
  | { kind: 'item'; item: ItemId; tier: number }
  | { kind: 'encore'; encore: string };

/** Would taking this item card put an evolution recipe over the line? Asked of
 *  the real gate, so it stays true across the #227 gate change (passive maxed
 *  -> passive merely owned) without this file knowing the rule. */
function unlocksEvolution(world: RunWorld, item: ItemId, level: number): boolean {
  const before = eligibleEvolutions(world.tiers, world.items, world.evolved).length;
  const hypothetical = new Map(world.items);
  hypothetical.set(item, level);
  return eligibleEvolutions(world.tiers, hypothetical, world.evolved).length > before;
}

/** THE BUILD ORDER, and the whole of it. Higher wins; ties break on screen
 *  order, so the roll — not this table — decides between equals.
 *
 *  The `human` ladder is what a survivors-like player does with three cards,
 *  in the order they'd say it out loud:
 *   1. take the passive that makes an evolution ready — the single biggest
 *      power step on the screen;
 *   2. hire an unowned weapon while band slots are open — breadth first, the
 *      standard opening in this genre and the thing the offer roll's own early
 *      drum nudge is built around;
 *   3. take Magnet's first level — the one passive that changes how much of
 *      what you kill you actually bank;
 *   4. push a weapon up, deepest first, because a maxed weapon is what an
 *      evolution needs;
 *   5. take a new passive, then level owned passives.
 *  Encores (a maxed build) take the heal; the alternative pays notes, which
 *  are meta currency and cannot affect pace. */
function pickPriority(world: RunWorld, card: Card): number {
  if (card.kind === 'encore') return 0;
  const ownedWeapons = world.tiers.size;
  if (card.kind === 'item') {
    const owned = itemLevel(world.items, card.item) > 0;
    if (unlocksEvolution(world, card.item, card.tier)) return 100;
    if (POLICY === 'weapons') return owned ? 10 : 12;
    if (POLICY === 'passives') return owned ? 60 : 70;
    if (card.item === 'magnetLanyard' && !owned) return 70;
    // A new passive outranks a weapon step (the slots are few and every one of
    // them multiplies the whole build); topping an owned passive up does not.
    return owned ? 45 : 55;
  }
  const isHire = (world.tiers.get(card.role) ?? 0) === 0;
  if (isHire && ownedWeapons < BUILD.weaponCap) return POLICY === 'passives' ? 65 : 80;
  // Deepest-first among upgrades: +1 per level already owned keeps the bot
  // finishing a weapon rather than smearing picks across five of them.
  return (POLICY === 'passives' ? 20 : 50) + (world.tiers.get(card.role) ?? 0);
}

/** The chest payout, mirroring rollChestDrops in src/game/game.ts: a ready
 *  evolution is the top prize and replaces the whole payout; otherwise each of
 *  the 1/3/5 hits lands uniformly on something OWNED and not yet maxed —
 *  weapons and passives in one pool, which is what brakes the weapon race. */
function payChest(world: RunWorld, size: number, rng: Rng): number {
  const ready = world.eligibleEvolutions();
  if (ready.length > 0) {
    world.evolve(ready[0].role);
    return 0;
  }
  let hits = 0;
  for (let i = 0; i < size; i++) {
    const pool: Card[] = [];
    for (const [role, tier] of world.tiers) {
      if (tier < (weaponTiers(role)?.length ?? 0)) pool.push({ kind: 'weapon', role, tier: tier + 1 });
    }
    for (const [item, level] of world.items) {
      if (level < itemMaxLevel(item)) pool.push({ kind: 'item', item, tier: level + 1 });
    }
    // An empty pool is the maxed build's leftover: a Tip Jar, i.e. notes. No
    // power, so nothing to apply here.
    if (pool.length === 0) continue;
    const target = pool[Math.floor(rng() * pool.length)];
    if (target.kind === 'weapon') world.addWeapon(target.role, target.tier);
    else if (target.kind === 'item') world.addItem(target.item, target.tier);
    hits += 1;
  }
  return hits;
}

function runSim(seed: number, damageScale: number): SimResult {
  const restore = scaleAllWeaponDamage(damageScale);
  const rng = mulberry32(seed);
  // A separate stream for the offer roll and the chest reel, so the bot's
  // choices never shift the world's spawns (and vice versa).
  const pickRng = mulberry32(seed ^ 0x9e3779b9);
  let pendingPicks = 0;
  let died: number | null = null;
  let won = false;
  let xpCollected = 0;
  let chestHits = 0;
  let lightsBroken = 0;
  const magnetAtS: number[] = [];
  // A broken light is `dead` with its HP spent; a light the cap retired is
  // `dead` with HP left. Both sit in the array for one more frame, which is
  // the frame this counts them in.
  const countedLights = new WeakSet<object>();
  const pendingChests: number[] = [];
  const reachedAtS = new Map<number, number>();

  const events: RunEvents = {
    onLevelUp: (level) => {
      pendingPicks += 1;
      if (MILESTONE_LEVELS.includes(level) && !reachedAtS.has(level)) reachedAtS.set(level, world.timeS);
    },
    onDeath: () => { died = died ?? world.timeS; },
    onVictory: () => { won = true; },
    onHit: () => {},
    onChest: () => { pendingChests.push(1); },
    onGemCollected: (xp) => { xpCollected += xp; },
  };

  // The bot. It farms rather than flees: both shipped auto-movers out-run the
  // horde and starve melee-range weapons, which is not how a human plays.
  // Below 60% HP it hands control to the shipped kiter until it heals.
  //
  // It also FETCHES THE TWO THINGS A PLAYER ALWAYS FETCHES: the boss chest
  // (free levels, and RunWorld only opens one within 42 units) and a dropped
  // Stage Magnet (a map-wide vacuum, and after #228 the only thing that
  // recovers a floor bank). Leaving those on the ground was the other half of
  // why the pre-#213 harness under-collected.
  const kiter = createGreedyMover();
  const toward = (x: number, y: number): { x: number; y: number } => {
    const p = world.player;
    const d = Math.hypot(x - p.x, y - p.y) || 1;
    return { x: (x - p.x) / d, y: (y - p.y) / d };
  };
  const nearestOf = <T extends { x: number; y: number }>(list: readonly T[]): T | null => {
    const p = world.player;
    let best: T | null = null;
    let bd = Infinity;
    for (const c of list) {
      const d = Math.hypot(c.x - p.x, c.y - p.y);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  };
  const farmer = (): { x: number; y: number } => {
    const p = world.player;
    if (p.hp < world.playerMaxHp * 0.6) return kiter(world);
    const chest = nearestOf(world.chests);
    if (chest) return toward(chest.x, chest.y);
    const magnet = nearestOf(world.stageMagnets);
    if (magnet) return toward(magnet.x, magnet.y);
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
    // Value-aware gem seeking: prefer big gems, but never ignore the floor.
    // Deliberately near-biased — a human drifts forward and leaves a long
    // trail behind, which is why xpOnFloor is a reported number, not a bug.
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

  // Opening hire. The starting roll offers three weapons; the kick is a
  // representative pick and is held fixed across seeds so the opening is not
  // one more source of variance.
  world.addWeapon('kick', 1);

  const applyPicks = (): void => {
    while (pendingPicks > 0) {
      pendingPicks -= 1;
      const offers = rollOffers({
        tiers: world.tiers,
        items: world.items,
        unlockedRoles,
        unlockedItems,
        rng: pickRng,
        timeS: world.timeS,
        level: world.level,
      }) as Card[];
      if (offers.length === 0) continue;
      let choice = offers[0];
      let bestScore = pickPriority(world, choice);
      for (const card of offers.slice(1)) {
        const score = pickPriority(world, card);
        if (score > bestScore) { bestScore = score; choice = card; }
      }
      if (choice.kind === 'weapon') world.addWeapon(choice.role, choice.tier);
      else if (choice.kind === 'item') world.addItem(choice.item, choice.tier);
      // The Encore's heal. Its sibling pays notes (meta currency) and the
      // pre-#231 tree's stat encores are gone, so neither moves pace.
      else world.applyEncoreChoice((choice.encore === 'tipJar' ? 'firstAid' : choice.encore) as 'firstAid');
    }
    while (pendingChests.length > 0) {
      pendingChests.pop();
      const scripted = CHEST.openingSequence[world.chestsOpened - 1];
      const roll = pickRng();
      const size = scripted ?? (roll < CHEST.jackpotChance ? 5 : roll < CHEST.jackpotChance + CHEST.bigWinChance ? 3 : 1);
      chestHits += payChest(world, size, pickRng);
    }
  };

  const minutes: MinuteRow[] = [];
  let nextStepIdx = 0;
  let magnetsSeen = 0;

  for (let tick = 0; tick * SIM_DT < RUN_S; tick++) {
    const t = tick * SIM_DT;
    if (died !== null || won) break;

    // Fire every chart trigger due before this tick's end, per owned role.
    const tEnd = t + SIM_DT;
    while (nextStepIdx * STEP_S < tEnd) {
      const stepTime = nextStepIdx * STEP_S;
      for (const [role, level] of world.tiers) {
        const ladder = SOUNDSET_LADDERS[role];
        if (!ladder) continue;
        const chart = ladder[chartStageForLevel(level) - 1];
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
    // `?? []`: the pre-#228 tree has no Stage Lights at all.
    for (const light of world.stageLights ?? []) {
      if (!light.dead || light.hp > 0 || countedLights.has(light)) continue;
      countedLights.add(light);
      lightsBroken += 1;
    }
    const magnetsNow = world.stageMagnets.length;
    if (magnetsNow > magnetsSeen) magnetAtS.push(world.timeS);
    magnetsSeen = magnetsNow;
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
    }
  }

  let floorXp = 0;
  for (const g of world.gems) floorXp += g.xp;
  const build = [
    ...[...world.tiers].map(([role, level]) => `${role}${level}${world.evolved.has(role) ? '*' : ''}`),
    ...[...world.items].map(([item, level]) => `${item}:${level}`),
  ].join(' ');

  restore();
  return {
    seed, damageScale, minutes,
    diedAtS: died,
    finalLevel: world.level, kills: world.kills, xpCollected: Math.round(xpCollected),
    xpOnFloor: Math.round(floorXp),
    reachedAtS,
    chests: world.chestsOpened, chestHits, evolutions: world.evolutionsMade,
    lightsBroken, magnetAtS,
    build,
  };
}

const scales = process.argv[2] ? process.argv[2].split(',').map(Number) : [1];
const seeds = process.argv[3] ? process.argv[3].split(',').map(Number) : [1234];

const stamp = (s: number | undefined): string =>
  s === undefined ? '—' : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

for (const scale of scales) {
  for (const seed of seeds) {
    const t0 = Date.now();
    const r = runSim(seed, scale);
    const lvl = (m: number) => r.minutes.find((x) => x.min === m)?.level ?? '-';
    const row = [5, 10, 15, 20, 25, 29].map((m) => `m${m}:L${lvl(m)}`).join(' ');
    console.log(
      `policy=${POLICY} scale=${scale} seed=${seed} → ${row} final=L${r.finalLevel} kills=${r.kills} ` +
      `xp=${r.xpCollected} floor=${r.xpOnFloor} died=${r.diedAtS !== null ? Math.round(r.diedAtS) + 's' : 'no'} (${((Date.now() - t0) / 1000).toFixed(1)}s)`,
    );
    console.log(
      `   L20@${stamp(r.reachedAtS.get(20))} L21@${stamp(r.reachedAtS.get(21))} ` +
      `L40@${stamp(r.reachedAtS.get(40))} L41@${stamp(r.reachedAtS.get(41))} ` +
      `chests=${r.chests} (${r.chestHits} hits) evolutions=${r.evolutions} ` +
      `lightsBroken=${r.lightsBroken} magnets@[${r.magnetAtS.map((s) => stamp(s)).join(' ')}]`,
    );
    console.log(`   build: ${r.build}`);
    for (const m of r.minutes) {
      console.log(`   m${String(m.min).padStart(2)} L${String(m.level).padStart(2)} kills=${String(m.kills).padStart(5)} alive=${String(m.alive).padStart(3)} xpGot=${m.xpCollected} floor=${m.xpOnFloor}`);
    }
  }
}
