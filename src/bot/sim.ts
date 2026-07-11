// One headless run (docs/tools/autoplay-bot.md): the real RunWorld, the
// real charts, the virtual conductor, a seeded RNG, no graphics, no real
// time. Returns the run record that batches aggregate.

import { SOUNDSET } from '../audio/soundset';
import type { Role } from '../audio/kits';
import { mulberry32 } from '../game/rng';
import { RunWorld } from '../game/run';
import { RUN } from '../game/config';
import { SIM_DT, VirtualConductor } from './conductor';
import { MOVERS, type MoverName } from './movers';
import { makePolicy } from './policies';

export interface SimSpec {
  seed: number;
  mover: MoverName;
  /** Policy spec string: random | deep | wide | focus:<role>. */
  policy: string;
}

export interface RunRecord {
  seed: number;
  mover: MoverName;
  policy: string;
  /** Git commit (plus -dirty) the run was simulated under. */
  config: string;
  victory: boolean;
  timeS: number;
  level: number;
  kills: number;
  picks: { t: number; role: Role; tier: number }[];
  damageByRole: Partial<Record<Role, number>>;
  killsByRole: Partial<Record<Role, number>>;
  /** The run's closest call: lowest hp reached and when. */
  minHp: number;
  minHpAtS: number;
  peakAlive: number;
  /** Swarm-density probe (docs/phases/vs-swarm-review.md). Two numbers, because
   *  "am I being swarmed" is quantity AND packing:
   *   - nearByMin[m]: mean enemies ON SCREEN (visible rectangle) during minute m.
   *     Quantity. Compare to VS floors ~15-30 early, ~100 by 8:00.
   *   - tightByMin[m]: mean enemies inside the CLOSE BUBBLE (TIGHT_R px) during
   *     minute m. Packing — the dense wall you carve. A fleeing player can have a
   *     high on-screen count (a spread tail) but a low tight count (no wall). */
  nearByMin: number[];
  tightByMin: number[];
  peakNear: number;
  peakTight: number;
}

/** Radius of the "close bubble" whose fill reads as the packed wall. */
const TIGHT_R = 260;

/** The headless view size: desktop dimensions, so spawn distances match
 *  what a desktop player experiences. The browser replay uses the same
 *  dimensions — spawn distance depends on them, and a replay must be
 *  tick-identical to the batch run that produced it. */
export const SIM_VIEW = { width: 1280, height: 800 };

export function simulateRun(spec: SimSpec, config: string): RunRecord {
  const rng = mulberry32(spec.seed);
  const policy = makePolicy(spec.policy);
  const mover = MOVERS[spec.mover]();

  let ended: 'death' | 'victory' | null = null;
  const events = {
    onLevelUp: () => conductor.onLevelUp(),
    onDeath: () => {
      ended = 'death';
    },
    onVictory: () => {
      ended = 'victory';
    },
    onHit: () => {},
  };

  const world: RunWorld = new RunWorld(SIM_VIEW, events, {
    rng,
    control: () => mover(world),
    fx: false,
  });
  world.powerMul = SOUNDSET.powerMul;
  const conductor = new VirtualConductor(world, policy.choose, rng);
  conductor.start(policy.startingKit(rng));

  let minHp = world.player.hp;
  let minHpAtS = 0;
  let peakAlive = 0;
  let peakNear = 0;
  let peakTight = 0;
  // Per-minute density accumulators (sum + tick count → mean).
  const nMin = Math.ceil(RUN.durationS / 60);
  const nearSum = new Array(nMin).fill(0);
  const tightSum = new Array(nMin).fill(0);
  const nearCnt = new Array(nMin).fill(0);

  // Fixed 60 Hz ticks: fidelity over speed, parallelism is the speed lever.
  const maxTicks = Math.ceil((RUN.durationS + 2) / SIM_DT);
  for (let i = 0; i < maxTicks && !ended; i++) {
    conductor.tick(SIM_DT);
    world.update(SIM_DT);
    if (world.player.hp < minHp) {
      minHp = world.player.hp;
      minHpAtS = world.timeS;
    }
    if (world.enemyCount > peakAlive) peakAlive = world.enemyCount;
    // Density probe: enemies on screen (quantity) and inside the close bubble
    // (packing). Read-only, so determinism is untouched.
    const { near, tight } = densityCounts(world);
    if (near > peakNear) peakNear = near;
    if (tight > peakTight) peakTight = tight;
    const m = Math.min(nMin - 1, Math.floor(world.timeS / 60));
    nearSum[m] += near;
    tightSum[m] += tight;
    nearCnt[m] += 1;
  }
  const nearByMin = nearSum.map((s, m) => (nearCnt[m] > 0 ? Math.round(s / nearCnt[m]) : 0));
  const tightByMin = tightSum.map((s, m) => (nearCnt[m] > 0 ? Math.round(s / nearCnt[m]) : 0));

  return {
    seed: spec.seed,
    mover: spec.mover,
    policy: spec.policy,
    config,
    victory: ended === 'victory',
    timeS: Math.round(world.timeS * 10) / 10,
    level: world.level,
    kills: world.kills,
    picks: conductor.picks.map((p) => ({ ...p, t: Math.round(p.t * 10) / 10 })),
    damageByRole: roundValues(world.damageByRole),
    killsByRole: world.killsByRole,
    minHp: Math.round(minHp),
    minHpAtS: Math.round(minHpAtS * 10) / 10,
    peakAlive,
    nearByMin,
    tightByMin,
    peakNear,
    peakTight,
  };
}

/** Enemies on screen (visible rectangle) and inside the close bubble (TIGHT_R),
 *  centred on the player. On-screen = quantity; close = packing. Read-only;
 *  never touches the sim. */
function densityCounts(world: RunWorld): { near: number; tight: number } {
  const p = world.player;
  const hw = world.worldW / 2;
  const hh = world.worldH / 2;
  const tr2 = TIGHT_R * TIGHT_R;
  let near = 0;
  let tight = 0;
  for (const e of world.enemies) {
    if (e.dead) continue;
    const dx = e.x - p.x;
    const dy = e.y - p.y;
    if (Math.abs(dx) <= hw && Math.abs(dy) <= hh) near++;
    if (dx * dx + dy * dy <= tr2) tight++;
  }
  return { near, tight };
}

function roundValues(
  rec: Partial<Record<Role, number>>,
): Partial<Record<Role, number>> {
  const out: Partial<Record<Role, number>> = {};
  for (const [k, v] of Object.entries(rec)) out[k as Role] = Math.round(v);
  return out;
}
