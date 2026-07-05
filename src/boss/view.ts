// Renderer for the boss arena. The whole fight fits on screen (a locked box,
// no camera scroll), so the world container is just scaled to letterbox ARENA
// into whatever viewport it gets. Immediate-mode: most layers clear and redraw
// each frame — the entity counts are modest and it keeps telegraph/live state
// dead simple to read. World sim is in world.ts; this only draws it.

import { Container, Graphics } from 'pixi.js';
import type { BossPalette } from './bosses';
import { ARENA, type BossWorld } from './world';

interface Pop {
  x: number;
  y: number;
  color: number;
  t: number;
  dur: number;
  kind: 'spark' | 'slam';
}

const DIAG = Math.hypot(ARENA.w, ARENA.h);

export class BossView {
  readonly stage: Container;
  private world: BossWorld;
  private palette: BossPalette;

  private box: Container; // world-space, scaled to fit
  private gFloor = new Graphics();
  private gGrid = new Graphics();
  private gHaz = new Graphics();
  private gBullets = new Graphics();
  private gBoss = new Graphics();
  private gPlayer = new Graphics();
  private gFx = new Graphics();
  private gBorder = new Graphics();

  private pops: Pop[] = [];
  private lastFit = 0;

  constructor(world: BossWorld, palette: BossPalette) {
    this.world = world;
    this.palette = palette;
    this.stage = new Container();
    this.box = new Container();
    this.stage.addChild(this.box);
    this.box.addChild(
      this.gFloor,
      this.gGrid,
      this.gHaz,
      this.gBullets,
      this.gFx,
      this.gBoss,
      this.gPlayer,
      this.gBorder,
    );
    this.drawStatic();
  }

  destroy(): void {
    this.stage.destroy({ children: true });
  }

  private drawStatic(): void {
    const hw = ARENA.w / 2;
    const hh = ARENA.h / 2;
    this.gFloor.clear().rect(-hw, -hh, ARENA.w, ARENA.h).fill(this.palette.bg);
    const cell = 80;
    const g = this.gGrid.clear();
    for (let x = -hw; x <= hw + 1; x += cell) g.moveTo(x, -hh).lineTo(x, hh);
    for (let y = -hh; y <= hh + 1; y += cell) g.moveTo(-hw, y).lineTo(hw, y);
    g.stroke({ width: 1.5, color: 0xffffff, alpha: 0.05 });
    this.gBorder
      .clear()
      .rect(-hw, -hh, ARENA.w, ARENA.h)
      .stroke({ width: 4, color: this.palette.accent, alpha: 0.5 });
  }

  private fit(viewW: number, viewH: number): void {
    const scale = Math.min(viewW / ARENA.w, viewH / ARENA.h) * 0.96;
    if (scale !== this.lastFit) {
      this.box.scale.set(scale);
      this.lastFit = scale;
    }
    this.box.position.set(viewW / 2, viewH / 2);
  }

  update(dt: number, viewW: number, viewH: number): void {
    this.fit(viewW, viewH);
    this.drawHazards();
    this.drawBullets();
    this.drawBoss();
    this.drawPlayer();
    this.drawFx(dt);
  }

  private drawHazards(): void {
    const g = this.gHaz.clear();
    const w = this.world;

    for (const s of w.shocks) {
      const live = s.age >= s.warnT;
      const r = live ? s.r0 + (s.age - s.warnT) * s.speed : s.r0;
      if (!live) {
        // wind-up: a tight pulsing core where the ring will burst from
        g.circle(s.x, s.y, s.r0 + 6).stroke({ width: 3, color: s.color, alpha: 0.5 });
      } else {
        const fade = Math.max(0.15, 1 - r / s.rMax);
        g.circle(s.x, s.y, r).stroke({ width: s.thickness, color: s.color, alpha: 0.5 * fade });
        g.circle(s.x, s.y, r).stroke({ width: 3, color: 0xffffff, alpha: 0.7 * fade });
      }
    }

    for (const z of w.zones) {
      const live = z.age >= z.warnT;
      if (!live) {
        const k = z.age / z.warnT;
        g.circle(z.x, z.y, z.radius).stroke({ width: 3, color: z.color, alpha: 0.3 + 0.5 * k });
      } else {
        g.circle(z.x, z.y, z.radius).fill({ color: z.color, alpha: 0.5 });
        g.circle(z.x, z.y, z.radius).stroke({ width: 3, color: 0xffffff, alpha: 0.8 });
      }
    }

    for (const bm of w.beams) {
      const live = bm.age >= bm.warnT;
      const alpha = live ? 0.85 : 0.3 + 0.35 * (bm.age / bm.warnT);
      const width = live ? bm.halfWidth * 2 : 5;
      let x1: number, y1: number, x2: number, y2: number;
      if (bm.type === 'vlane') {
        x1 = x2 = bm.ox;
        y1 = -ARENA.h / 2;
        y2 = ARENA.h / 2;
      } else if (bm.type === 'hlane') {
        y1 = y2 = bm.oy;
        x1 = -ARENA.w / 2;
        x2 = ARENA.w / 2;
      } else {
        const dx = Math.cos(bm.angle);
        const dy = Math.sin(bm.angle);
        x1 = bm.ox - dx * DIAG;
        y1 = bm.oy - dy * DIAG;
        x2 = bm.ox + dx * DIAG;
        y2 = bm.oy + dy * DIAG;
      }
      g.moveTo(x1, y1).lineTo(x2, y2).stroke({ width, color: bm.color, alpha });
      if (live) {
        g.moveTo(x1, y1).lineTo(x2, y2).stroke({ width: Math.max(3, width * 0.25), color: 0xffffff, alpha: 0.9 });
      }
    }

    for (const a of w.arcs) {
      const live = a.age >= a.warnT;
      g.moveTo(a.cx, a.cy)
        .arc(a.cx, a.cy, a.reach, a.angle - a.half, a.angle + a.half)
        .lineTo(a.cx, a.cy);
      if (live) g.fill({ color: a.color, alpha: 0.55 });
      else g.stroke({ width: 3, color: a.color, alpha: 0.35 + 0.4 * (a.age / a.warnT) });
    }
  }

  private drawBullets(): void {
    const g = this.gBullets.clear();
    for (const b of this.world.bullets) {
      g.circle(b.x, b.y, b.radius + 2).fill({ color: b.color, alpha: 0.9 });
      g.circle(b.x, b.y, b.radius * 0.5).fill({ color: 0xffffff, alpha: 0.85 });
    }
  }

  private drawBoss(): void {
    const b = this.world.boss;
    const g = this.gBoss.clear();
    const r = b.radius * (1 + 0.14 * b.pulse);
    // outer aura pulse
    g.circle(b.x, b.y, r + 14 + b.pulse * 26).fill({ color: b.color, alpha: 0.12 + 0.18 * b.pulse });
    g.circle(b.x, b.y, r).fill({ color: b.color, alpha: 0.9 });
    g.circle(b.x, b.y, r).stroke({ width: 3, color: 0xffffff, alpha: 0.5 });
    g.circle(b.x, b.y, r * 0.5).fill({ color: 0x0a0a12, alpha: 0.85 });
    g.circle(b.x, b.y, r * 0.5).stroke({ width: 2, color: this.palette.accent, alpha: 0.8 });
  }

  private drawPlayer(): void {
    const p = this.world.player;
    const g = this.gPlayer.clear();
    const invuln = p.iframesT > 0;
    if (p.dashT > 0) {
      g.circle(p.x, p.y, p.radius + 8).stroke({ width: 2, color: this.palette.accent, alpha: 0.6 });
    }
    g.circle(p.x, p.y, p.radius).fill({ color: 0xffffff, alpha: invuln ? 0.45 : 1 });
    g.circle(p.x, p.y, p.radius).stroke({ width: 2.5, color: this.palette.accent, alpha: invuln ? 0.4 : 0.95 });
  }

  private drawFx(dt: number): void {
    for (const fx of this.world.fx) {
      this.pops.push({ x: fx.x, y: fx.y, color: fx.color, t: 0, dur: fx.type === 'slam' ? 0.3 : 0.22, kind: fx.type });
    }
    this.world.fx.length = 0;
    const g = this.gFx.clear();
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const p = this.pops[i];
      p.t += dt;
      const k = p.t / p.dur;
      if (k >= 1) {
        this.pops.splice(i, 1);
        continue;
      }
      if (p.kind === 'slam') {
        g.circle(p.x, p.y, 20 + k * 90).stroke({ width: 6 * (1 - k), color: p.color, alpha: 0.7 * (1 - k) });
      } else {
        g.circle(p.x, p.y, 4 + k * 16).fill({ color: p.color, alpha: 0.8 * (1 - k) });
      }
    }
  }
}
