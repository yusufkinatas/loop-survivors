import type { Enemy, RunWorld } from './run';

export type AutoMover = (world: RunWorld) => { x: number; y: number };

const HEAVY_THREATS = new Set<Enemy['kind']>([
  'tank',
  'elite',
  'greenMudman',
  'grayMudman',
  'glowingBat',
  'mantis',
  'giantBat',
  'silverBat',
  'werewolf',
  'bigMummy',
  'venus',
  'giantMantis',
  'giantWerewolf',
  'giantMummy',
  'giantBlueVenus',
]);

function weightedThreat(enemy: Enemy, base: number): number {
  let weight = base;
  if (HEAVY_THREATS.has(enemy.kind)) weight *= 1.5;
  if (enemy.kind === 'batSwarm' || enemy.kind === 'ghostSwarm') weight *= 2.5;
  if (enemy.kind === 'darter' && enemy.dashing) weight *= 2;
  return weight;
}

function threatVector(world: RunWorld): { tx: number; ty: number; threat: number } {
  const p = world.player;
  const range = 420;
  let tx = 0;
  let ty = 0;
  for (const enemy of world.enemies) {
    if (enemy.dead) continue;
    const dx = p.x - enemy.x;
    const dy = p.y - enemy.y;
    const distance = Math.hypot(dx, dy);
    if (distance > range || distance < 0.001) continue;
    const weight = weightedThreat(enemy, (1 - distance / range) ** 2);
    tx += (dx / distance) * weight;
    ty += (dy / distance) * weight;
  }
  return { tx, ty, threat: Math.hypot(tx, ty) };
}

function normalize(x: number, y: number): { x: number; y: number } {
  const length = Math.hypot(x, y);
  if (length < 0.05) return { x: 0, y: 0 };
  return { x: x / length, y: y / length };
}

/** Flees nearby enemies along the edge of the horde and collects safe gems. */
export function createKiter(): AutoMover {
  return (world) => {
    const p = world.player;
    const { tx, ty, threat } = threatVector(world);
    let moveX = 0;
    let moveY = 0;

    if (threat > 0.02) {
      const fleeX = tx / threat;
      const fleeY = ty / threat;
      moveX = fleeX - fleeY * 0.55;
      moveY = fleeY + fleeX * 0.55;
    }

    if (threat < 1.4) {
      let gemX = 0;
      let gemY = 0;
      let bestDistance = 360;
      for (const gem of world.gems) {
        const distance = Math.hypot(gem.x - p.x, gem.y - p.y);
        if (distance < bestDistance) {
          bestDistance = distance;
          gemX = gem.x;
          gemY = gem.y;
        }
      }
      if (bestDistance < 360) {
        const distance = Math.hypot(gemX - p.x, gemY - p.y) || 1;
        const pull = threat < 0.4 ? 1 : 0.45;
        moveX += ((gemX - p.x) / distance) * pull;
        moveY += ((gemY - p.y) / distance) * pull;
      }
    }

    return normalize(moveX, moveY);
  };
}

/** Prioritizes nearby XP while still orbiting away from dangerous packs. */
export function createGreedyMover(): AutoMover {
  let spin = 1;
  let nextSpinCheckS = 0;

  return (world) => {
    const p = world.player;
    const { tx, ty, threat } = threatVector(world);
    let moveX = 0;
    let moveY = 0;

    if (threat > 0.02) {
      const fleeX = tx / threat;
      const fleeY = ty / threat;
      if (world.timeS >= nextSpinCheckS) {
        nextSpinCheckS = world.timeS + 2;
        let side = 0;
        for (const gem of world.gems) {
          const dx = gem.x - p.x;
          const dy = gem.y - p.y;
          const distance = Math.hypot(dx, dy);
          if (distance > 700 || distance < 0.001) continue;
          const cross = fleeX * dy - fleeY * dx;
          side += Math.sign(cross) * gem.xp * (1 - distance / 700);
        }
        if (Math.abs(side) > 8) spin = side > 0 ? 1 : -1;
      }
      moveX = fleeX - fleeY * 0.55 * spin;
      moveY = fleeY + fleeX * 0.55 * spin;
    }

    let gemX = 0;
    let gemY = 0;
    for (const gem of world.gems) {
      const dx = gem.x - p.x;
      const dy = gem.y - p.y;
      const distance = Math.hypot(dx, dy);
      if (distance > 300 || distance < 0.001) continue;
      const weight = gem.xp * (1 - distance / 300);
      gemX += (dx / distance) * weight;
      gemY += (dy / distance) * weight;
    }
    const mass = Math.hypot(gemX, gemY);
    if (mass > 0.001) {
      const pull = Math.min(1.1, mass / 12) * Math.max(0.2, 1 - threat / 3);
      moveX += (gemX / mass) * pull;
      moveY += (gemY / mass) * pull;
    }

    return normalize(moveX, moveY);
  };
}
