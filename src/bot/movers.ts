// Movers (docs/tools/autoplay-bot.md): pluggable movement policies. Every
// build comparison holds the mover constant — a bot's win rate measures the
// build under that mover's skill, never the build in the abstract.

import type { RunWorld } from '../game/run';

export type MoverName = 'afk' | 'kiter';

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
    if (e.kind === 'tank') w *= 1.5;
    if (e.kind === 'darter' && e.dashing) w *= 2.0;
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

export const MOVERS: Record<MoverName, Mover> = { afk, kiter };
