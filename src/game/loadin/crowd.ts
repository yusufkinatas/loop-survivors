// THE CROWD (package 19, #255), hosted here as a WIN-CONDITION TOGGLE — #256's
// ruling: "same map, same gear, flip whether The Hush is killed or converted".
// The designer judged The Crowd prototype-worthy for being unlike everything
// else; hosting it on The Load-In buys that at a fraction of the exposure.
//
// What flips when it is on:
//
//   - A defeated body does not simply die. It CONVERTS: a fan appears where it
//     fell, joins the crowd, and moves with the beat.
//   - Fans soak. A body that runs into one is slowed and chews on the fan
//     instead of on you, which is the first thing in this game that has ever
//     stood between the player and the horde.
//   - Fans amplify. A fan standing inside a piece of gear's presence makes that
//     piece louder and harder, which is the second reason to lead the crowd
//     across your own stage.
//   - You can lose by LOSING THE ROOM. A meter drains, fans refill it, and a
//     room bores of one sound — so the drain scales with how one-sided the last
//     few seconds of the mix were.
//
// THAT LAST RULE IS THE INTERLOCK, and it is why The Crowd belongs on this stack
// specifically rather than anywhere else. The only thing in The Load-In that
// makes a mix one-sided is HAULING: carry four of your five pieces and one voice
// is left playing alone. So The Crowd puts a price on the valley — the deeper
// the drop, the faster the room drains — and "how long dare I stay quiet" stops
// being a question only about damage.

import type { Role } from '../../audio/kits';
import type { FxEvent } from '../run';
import { RUN } from '../config';
import { CROWD } from './config';
import type { Rig } from './stage';

export interface Fan {
  id: number;
  x: number;
  y: number;
  hp: number;
  /** Phase offset so the crowd bobs as a crowd rather than as one animation. */
  bob: number;
  dead: boolean;
}

interface CrowdHost {
  readonly timeS: number;
  readonly player: { x: number; y: number };
  fx(event: FxEvent): void;
}

/** A body that would have chased you now stands with you. */
export class Crowd {
  readonly fans: Fan[] = [];
  /** 0..1. The run ends when it reaches zero. */
  room: number = CROWD.startRoom;
  private nextId = 1;
  /** Rolling per-role trigger tally, used for the variety measure. Entries are
   *  timestamped so the window slides rather than resetting in steps — a meter
   *  that jumps every eight seconds reads as a bug. */
  private recent: { t: number; role: Role }[] = [];

  constructor(private readonly host: CrowdHost) {}

  /** One trigger heard. Called from the same listener the world's damage rides,
   *  so what the room judges is exactly what the player heard. */
  noteTrigger(role: Role): void {
    this.recent.push({ t: this.host.timeS, role });
  }

  /** A body went down. With the crowd on this is a conversion rather than a
   *  death, so the fan lands where the body fell. */
  convert(x: number, y: number): void {
    if (this.fans.length >= CROWD.maxFans) return;
    this.fans.push({ id: this.nextId++, x, y, hp: CROWD.fanHp, bob: (this.nextId * 0.618) % 1, dead: false });
    this.room = Math.min(1, this.room + CROWD.perFanGained);
    this.host.fx({ type: 'ring', x, y, radius: CROWD.fanRadius * 3, color: 0xffd45c, dur: 0.35, soft: true });
  }

  /** How concentrated the last few seconds of the mix were: 1 when a single
   *  voice is carrying the whole track, 1/n when n voices share it evenly. The
   *  ordinary sum-of-squares share measure, which is the simplest thing that
   *  says "one-sided" without needing to know anything about music. */
  concentration(): number {
    const cutoff = this.host.timeS - CROWD.varietyWindowS;
    while (this.recent.length > 0 && this.recent[0].t < cutoff) this.recent.shift();
    if (this.recent.length === 0) return 1; // silence is as one-sided as it gets
    const counts = new Map<Role, number>();
    for (const entry of this.recent) counts.set(entry.role, (counts.get(entry.role) ?? 0) + 1);
    let sum = 0;
    for (const n of counts.values()) sum += (n / this.recent.length) ** 2;
    return sum;
  }

  /** Bounding box of the whole crowd, recomputed once a frame. `slows` is asked
   *  about EVERY body every frame — seventy fans against four hundred bodies is
   *  twenty-eight thousand distance tests — and the crowd is a cloud around the
   *  player, so the overwhelming majority of those bodies are nowhere near it.
   *  One rectangle test throws them out. */
  private minX = 0;
  private minY = 0;
  private maxX = 0;
  private maxY = 0;

  private bound(): void {
    if (this.fans.length === 0) {
      this.minX = this.maxX = this.minY = this.maxY = 0;
      return;
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const fan of this.fans) {
      if (fan.dead) continue;
      if (fan.x < minX) minX = fan.x;
      if (fan.x > maxX) maxX = fan.x;
      if (fan.y < minY) minY = fan.y;
      if (fan.y > maxY) maxY = fan.y;
    }
    const pad = CROWD.fanRadius + 64;
    this.minX = minX - pad;
    this.minY = minY - pad;
    this.maxX = maxX + pad;
    this.maxY = maxY + pad;
  }

  update(dt: number, enemies: readonly { x: number; y: number; radius: number; dead: boolean; dummy: boolean; damage: number; speed: number }[]): void {
    this.moveFans(dt);
    this.bound();
    this.soak(dt, enemies);
    const c = this.concentration();
    // Linear between the two ends. Perfectly even across five voices is 0.2, one
    // voice alone is 1.0, so the drain runs roughly seven times faster with the
    // band on your back than with it playing.
    const spread = Math.max(0, Math.min(1, (c - 0.2) / 0.8));
    const multiplier = CROWD.varietyBest + (CROWD.varietyWorst - CROWD.varietyBest) * spread;
    this.room = Math.max(0, this.room - CROWD.drainPerS * multiplier * dt);
  }

  private moveFans(dt: number): void {
    const p = this.host.player;
    for (let i = this.fans.length - 1; i >= 0; i--) {
      const fan = this.fans[i];
      if (fan.dead) {
        this.fans.splice(i, 1);
        this.room = Math.max(0, this.room - CROWD.perFanLost);
        this.host.fx({ type: 'spark', x: fan.x, y: fan.y, color: 0x8b93a7, n: 4, spread: 14 });
        continue;
      }
      const dx = p.x - fan.x;
      const dy = p.y - fan.y;
      const d = Math.hypot(dx, dy) || 1;
      // A loose ring rather than a pile: they stop at personal space and drift
      // back out if they are shoved inside it.
      const want = d - CROWD.personalSpace;
      if (Math.abs(want) < 6) continue;
      const step = Math.sign(want) * RUN.playerSpeed * CROWD.followSpeed * dt;
      fan.x += (dx / d) * step;
      fan.y += (dy / d) * step;
    }
  }

  /** A fan between you and a body is the whole reason the crowd is worth having.
   *  The enemy is not damaged — the fan is not a weapon — it is SLOWED and it
   *  spends its time chewing, which buys the roadie the seconds a roadie needs. */
  private soak(
    dt: number,
    enemies: readonly { x: number; y: number; radius: number; dead: boolean; dummy: boolean; damage: number; speed: number }[],
  ): void {
    if (this.fans.length === 0) return;
    for (const e of enemies) {
      if (e.dead || e.dummy) continue;
      if (e.x < this.minX || e.x > this.maxX || e.y < this.minY || e.y > this.maxY) continue;
      for (const fan of this.fans) {
        if (fan.dead) continue;
        const reach = CROWD.fanRadius + e.radius;
        const dx = e.x - fan.x;
        const dy = e.y - fan.y;
        if (dx * dx + dy * dy > reach * reach) continue;
        fan.hp -= CROWD.fanChewDps * dt;
        if (fan.hp <= 0) fan.dead = true;
        break;
      }
    }
  }

  /** True while a body is standing in the crowd, which is what the world reads
   *  to slow it. A query rather than a write, so the crowd never touches enemy
   *  state directly. */
  slows(x: number, y: number, radius: number): boolean {
    if (x < this.minX || x > this.maxX || y < this.minY || y > this.maxY) return false;
    for (const fan of this.fans) {
      if (fan.dead) continue;
      const reach = CROWD.fanRadius + radius;
      const dx = x - fan.x;
      const dy = y - fan.y;
      if (dx * dx + dy * dy <= reach * reach) return true;
    }
    return false;
  }

  /** How much each piece of gear is amplified by the fans standing in it. */
  gainByRig(rigs: readonly Rig[]): Map<Rig, number> {
    const out = new Map<Rig, number>();
    if (this.fans.length === 0) return out;
    for (const rig of rigs) {
      if (rig.carried) continue;
      let n = 0;
      const reach = rig.presence * rig.presence;
      for (const fan of this.fans) {
        if (fan.dead) continue;
        const dx = fan.x - rig.x;
        const dy = fan.y - rig.y;
        if (dx * dx + dy * dy <= reach) n++;
      }
      if (n > 0) out.set(rig, Math.min(CROWD.maxFanGain, n * CROWD.gainPerFan));
    }
    return out;
  }
}
