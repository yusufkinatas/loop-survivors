// Reward sequencing and layout primitives shared by the live shell and its
// regression checks. Keeping FIFO ownership here makes same-frame XP/chest
// ordering explicit instead of relying on scattered array operations.

import { LEVELUP } from './config';

export type PendingReward =
  | { kind: 'level'; level: number }
  | { kind: 'chest' };

export class PendingRewardQueue {
  private readonly items: PendingReward[] = [];

  enqueue(reward: PendingReward): void {
    this.items.push(reward);
  }

  dequeue(): PendingReward | undefined {
    return this.items.shift();
  }

  clear(): void {
    this.items.length = 0;
  }

  get length(): number {
    return this.items.length;
  }
}

/** Choice-token angles in degrees. Evolution layouts have locked symmetry;
 * normal rewards retain the existing triangle order. One eligible evolution
 * is scheduled directly and therefore never asks for an angle. */
export function rewardChoiceAngles(count: number, allEvolutions: boolean): number[] {
  if (count <= 0) return [];
  if (allEvolutions && count === 2) return [0, 180];
  if (allEvolutions && count === 4) return [0, 90, 180, 270];
  return Array.from({ length: count }, (_, index) => LEVELUP.angles[index % LEVELUP.angles.length]);
}
