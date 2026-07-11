// Movers (docs/tools/autoplay-bot.md): pluggable movement policies. Every
// build comparison holds the mover constant — a bot's win rate measures the
// build under that mover's skill, never the build in the abstract.

import type { RunWorld } from '../game/run';

export type MoverName = 'afk' | 'kiter' | 'harvester' | 'orbiter';

export type Mover = (world: RunWorld) => { x: number; y: number };

/** The difficulty canary: if AFK survives, difficulty is broken. */
const afk: Mover = () => ({ x: 0, y: 0 });

/** The competent default: flee the local pack along a curve (orbiting the
 *  horde reads and plays like human kiting; backing straight away walks
 *  into the offscreen spawn ring), detour toward gems when pressure allows. */
const kiter: Mover = (world) => {
  const p = world.player;
  const RANGE = 420;

  // threat vector: summed repulsion from every enemy in range, closer and
  // meaner enemies weigh more; a dashing darter is the scariest thing here
  let tx = 0;
  let ty = 0;
  for (const e of world.enemies) {
    if (e.dead) continue;
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const d = Math.hypot(dx, dy);
    if (d > RANGE || d < 0.001) continue;
    let w = (1 - d / RANGE) ** 2;
    // Weight the enemies that actually threaten a kiter: the big walls you must
    // route around, and the fast kinds that outrun you (VS speed relationships).
    if (e.kind === 'mantis' || e.kind === 'elite') w *= 1.7;
    else if (e.kind === 'ghost') w *= 1.8; // 1.82x player — the real chaser
    else if (e.kind === 'werewolf') w *= 1.5; // fast and hits hard
    else if (e.kind === 'bat') w *= 1.2; // fast, catches you
    tx += (dx / d) * w;
    ty += (dy / d) * w;
  }
  const threat = Math.hypot(tx, ty);

  let mx = 0;
  let my = 0;
  if (threat > 0.02) {
    const fx = tx / threat;
    const fy = ty / threat;
    // tangential lean: slide along the horde's edge instead of retreating
    // in a straight line forever
    mx = fx - fy * 0.55;
    my = fy + fx * 0.55;
  }

  // gems: worth a detour when the pressure is manageable
  if (threat < 1.4) {
    let gx = 0;
    let gy = 0;
    let bestD = 360;
    for (const g of world.gems) {
      const d = Math.hypot(g.x - p.x, g.y - p.y);
      if (d < bestD) {
        bestD = d;
        gx = g.x;
        gy = g.y;
      }
    }
    if (bestD < 360) {
      const d = Math.hypot(gx - p.x, gy - p.y) || 1;
      const pull = threat < 0.4 ? 1 : 0.45;
      mx += ((gx - p.x) / d) * pull;
      my += ((gy - p.y) / d) * pull;
    }
  }

  const len = Math.hypot(mx, my);
  if (len < 0.05) return { x: 0, y: 0 };
  return { x: mx / len, y: my / len };
};

/** Shared threat sense: repulsion vector away from the local pack. */
function threatVector(world: RunWorld): { tx: number; ty: number; threat: number } {
  const p = world.player;
  const RANGE = 420;
  let tx = 0;
  let ty = 0;
  for (const e of world.enemies) {
    if (e.dead) continue;
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const d = Math.hypot(dx, dy);
    if (d > RANGE || d < 0.001) continue;
    let w = (1 - d / RANGE) ** 2;
    // Weight the enemies that actually threaten a kiter: the big walls you must
    // route around, and the fast kinds that outrun you (VS speed relationships).
    if (e.kind === 'mantis' || e.kind === 'elite') w *= 1.7;
    else if (e.kind === 'ghost') w *= 1.8; // 1.82x player — the real chaser
    else if (e.kind === 'werewolf') w *= 1.5; // fast and hits hard
    else if (e.kind === 'bat') w *= 1.2; // fast, catches you
    tx += (dx / d) * w;
    ty += (dy / d) * w;
  }
  return { tx, ty, threat: Math.hypot(tx, ty) };
}

/** The kiter's calibration-gate finding (July 4): it orbits away from the
 *  horde while the XP it needs piles up behind it. A first harvester that
 *  blended a gem force-field into the orbit measured WORSE than the kiter
 *  (gem directions cancel when piles surround you; the jitter broke the
 *  orbit and the kill rate). This one thinks in targets instead: find the
 *  single richest safe pile, commit to it until collected or too hot, then
 *  resume orbiting. Needs per-run memory, hence the factory. */
function makeHarvester(): Mover {
  // orbit direction: +1 or -1, kept until the other side is clearly richer
  let spin = 1;
  let nextSpinCheckS = 0;

  return (world) => {
    const p = world.player;
    const { tx, ty, threat } = threatVector(world);

    let mx = 0;
    let my = 0;
    if (threat > 0.02) {
      const fx = tx / threat;
      const fy = ty / threat;
      // which way around the horde? sweep toward the gem-richer side.
      // Reconsidered on a slow, deterministic cadence with hysteresis so
      // the orbit doesn't dither. (The kiter's fixed sign means it sweeps
      // the same arc forever while drops pile up on the other side.)
      if (world.timeS >= nextSpinCheckS) {
        nextSpinCheckS = world.timeS + 2;
        let side = 0; // + means the (+1)-spin side is richer
        for (const g of world.gems) {
          const dx = g.x - p.x;
          const dy = g.y - p.y;
          const d = Math.hypot(dx, dy);
          if (d > 700 || d < 0.001) continue;
          const cross = fx * dy - fy * dx; // which side of the flee axis
          side += Math.sign(cross) * g.xp * (1 - d / 700);
        }
        if (Math.abs(side) > 8) spin = side > 0 ? 1 : -1;
      }
      mx = fx - fy * 0.55 * spin;
      my = fy + fx * 0.55 * spin;
    }

    // the vacuum: gems inside the close bubble (the space the weapons keep
    // carving) are safe almost by definition — the wall stands beyond them.
    // Strong pull, faded only under extreme pressure.
    let gx = 0;
    let gy = 0;
    for (const g of world.gems) {
      const dx = g.x - p.x;
      const dy = g.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d > 300 || d < 0.001) continue;
      const w = g.xp * (1 - d / 300);
      gx += (dx / d) * w;
      gy += (dy / d) * w;
    }
    const mass = Math.hypot(gx, gy);
    if (mass > 0.001) {
      const pull = Math.min(1.1, mass / 12) * Math.max(0.2, 1 - threat / 3);
      mx += (gx / mass) * pull;
      my += (gy / mass) * pull;
    }
    return norm(mx, my);
  };
}

function norm(x: number, y: number): { x: number; y: number } {
  const len = Math.hypot(x, y);
  if (len < 0.05) return { x: 0, y: 0 };
  return { x: x / len, y: y / len };
}

/** The HONEST Vampire-Survivors-play proxy (docs/phases/vs-swarm-review.md).
 *  The `kiter` FLEES the horde in a curve, which is precisely what removes the
 *  swarm feel: fleeing outruns the pack and strings it into a thin trailing
 *  tail. Nobody plays VS that way. A VS player CIRCLE-STRAFES — loops so the
 *  horde stays packed into a moving arc beside/behind them while their weapons
 *  carve it. This mover does that: it steers TANGENTIAL to the local pack
 *  (skirting the wall, not fleeing through it), holding a standoff only when
 *  about to be pinned, and keeps a persistent heading so an even surround
 *  (whose threat vector cancels) still loops instead of stalling. It is the
 *  proxy that tells us whether the density/packing tuning actually produces a
 *  wall a competent player must carve — the kiter cannot, by construction.
 *  Trig-free (Math.hypot/sqrt only), like the other movers, so Node batch runs
 *  and Chrome replays stay bit-identical. */
function makeOrbiter(): Mover {
  // Persistent heading: fixes the rotational sense of the orbit, and carries the
  // player straight to re-engage when nothing is in range.
  let hx = 1;
  let hy = 0;
  return (world) => {
    const p = world.player;
    const { tx, ty, threat } = threatVector(world);

    let dx: number;
    let dy: number;
    if (threat > 0.05) {
      const fx = tx / threat; // unit vector AWAY from the local pack
      const fy = ty / threat;
      // Orbit: MOSTLY tangential (circle the pack) with a SMALL outward radial
      // so we skirt the wall's edge at a standoff instead of either fleeing
      // through open ground (the kiter, which sheds the horde) or diving in
      // (which pins us). Tangential keeps the horde packed just inside the loop
      // — the dense wall a VS player carves. Rotational sense follows the
      // heading so the orbit doesn't dither.
      let a = -fy;
      let b = fx;
      if (a * hx + b * hy < 0) {
        a = fy;
        b = -fx;
      }
      const RADIAL = 0.4; // gentle standoff; << the kiter's 1.0 pure flee
      dx = a + fx * RADIAL;
      dy = b + fy * RADIAL;
      // About to be pinned: add more outward so a bad surround doesn't kill us.
      const push = Math.min(1.2, Math.max(0, (threat - 1.8) * 0.5));
      dx += fx * push;
      dy += fy * push;
    } else {
      // Nothing close (rare — the floor keeps a wall around): carry straight on
      // the current heading to re-engage the nearest edge of the horde.
      dx = hx;
      dy = hy;
    }

    // Light gem detour so the proxy still levels a real build (a weak build
    // would die to the density and understate survivability). A small nudge
    // only, and only when pressure is manageable — never overrides the orbit.
    if (threat < 1.5) {
      let gx = 0;
      let gy = 0;
      let bestD = 260;
      for (const g of world.gems) {
        const d = Math.hypot(g.x - p.x, g.y - p.y);
        if (d < bestD) {
          bestD = d;
          gx = g.x;
          gy = g.y;
        }
      }
      if (bestD < 260) {
        const d = Math.hypot(gx - p.x, gy - p.y) || 1;
        dx += ((gx - p.x) / d) * 0.35;
        dy += ((gy - p.y) / d) * 0.35;
      }
    }

    const n = norm(dx, dy);
    if (n.x !== 0 || n.y !== 0) {
      hx = n.x;
      hy = n.y;
    }
    return n;
  };
}

/** Movers carry per-run state (the harvester's committed target), so each
 *  run gets a fresh instance. */
export const MOVERS: Record<MoverName, () => Mover> = {
  afk: () => afk,
  kiter: () => kiter,
  harvester: makeHarvester,
  orbiter: makeOrbiter,
};
