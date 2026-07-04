// The run's renderer: everything PixiJS lives here. The world (run.ts) is
// pure simulation; this view diffs its state every frame — creating visuals
// for new entities, syncing live ones, destroying gone ones — and drains the
// world's fx queue. Headless bot runs never construct a view, which is the
// whole point of the split (docs/tools/autoplay-bot.md).

import { Container, Graphics } from 'pixi.js';
import { RUN } from './config';
import type { Enemy, FxEvent, Gem, Projectile, RunWorld, Zone } from './run';

interface Pop {
  gfx: Graphics;
  t: number;
  dur: number;
  grow: number;
}

export class RunView {
  readonly stage: Container;

  private world: RunWorld;
  private view: { width: number; height: number };

  private gridGfx = new Graphics();
  private playerGfx = new Graphics();
  private enemyGfx = new Map<Enemy, Graphics>();
  private projectileGfx = new Map<Projectile, Graphics>();
  private zoneGfx = new Map<Zone, Graphics>();
  private gemGfx = new Map<Gem, Graphics>();
  private pops: Pop[] = [];
  private live = new Set<object>();

  constructor(world: RunWorld, view: { width: number; height: number }) {
    this.world = world;
    this.view = view;
    this.stage = new Container();
    this.stage.addChild(this.gridGfx);
    this.playerGfx.circle(0, 0, RUN.playerRadius).fill(0xffffff);
    this.stage.addChild(this.playerGfx);
  }

  /** Sync visuals to the world. Call once per frame, after world.update. */
  update(dt: number): void {
    for (const fx of this.world.fx ?? []) this.spawnFx(fx);
    if (this.world.fx) this.world.fx.length = 0;

    this.syncEnemies();
    this.sync(this.world.projectiles, this.projectileGfx, makeProjectileGfx, (pr, gfx) => {
      gfx.position.set(pr.x, pr.y);
      if (pr.role !== 'hat') gfx.rotation = Math.atan2(pr.vy, pr.vx);
    });
    this.sync(this.world.zones, this.zoneGfx, makeZoneGfx, (z, gfx) => {
      gfx.alpha = Math.min(1, z.lifeS * 2);
    });
    this.sync(this.world.gems, this.gemGfx, makeGemGfx, (g, gfx) => {
      gfx.position.set(g.x, g.y);
    });
    this.updatePops(dt);
    this.drawGrid();

    // camera locked on player, scaled for the screen
    const zoom = this.world.zoom;
    const p = this.world.player;
    this.stage.scale.set(zoom);
    this.stage.position.set(
      this.view.width / 2 - p.x * zoom,
      this.view.height / 2 - p.y * zoom,
    );
    this.playerGfx.position.set(p.x, p.y);
    this.playerGfx.alpha = p.iframesT > 0 ? 0.5 : 1;
  }

  destroy(): void {
    this.stage.destroy({ children: true });
    this.enemyGfx.clear();
    this.projectileGfx.clear();
    this.zoneGfx.clear();
    this.gemGfx.clear();
    this.pops.length = 0;
  }

  private syncEnemies(): void {
    this.live.clear();
    for (const e of this.world.enemies) {
      let gfx = this.enemyGfx.get(e);
      if (!gfx) {
        gfx = makeEnemyGfx(e);
        this.enemyGfx.set(e, gfx);
        this.stage.addChild(gfx);
      }
      gfx.position.set(e.x, e.y);
      gfx.tint = e.flashT > 0 ? 0xffffff : e.color;
      if (e.kind === 'darter' && (e.dashX !== 0 || e.dashY !== 0)) {
        gfx.rotation = Math.atan2(e.dashY, e.dashX);
      }
      this.live.add(e);
    }
    for (const [e, gfx] of this.enemyGfx) {
      if (!this.live.has(e)) {
        gfx.destroy();
        this.enemyGfx.delete(e);
      }
    }
  }

  /** Generic diff for the simpler entity kinds. */
  private sync<T extends object>(
    entities: readonly T[],
    map: Map<T, Graphics>,
    make: (entity: T) => Graphics,
    apply: (entity: T, gfx: Graphics) => void,
  ): void {
    this.live.clear();
    for (const entity of entities) {
      let gfx = map.get(entity);
      if (!gfx) {
        gfx = make(entity);
        map.set(entity, gfx);
        this.stage.addChild(gfx);
      }
      apply(entity, gfx);
      this.live.add(entity);
    }
    for (const [entity, gfx] of map) {
      if (!this.live.has(entity)) {
        gfx.destroy();
        map.delete(entity);
      }
    }
  }

  private spawnFx(fx: FxEvent): void {
    if (fx.type === 'ring') {
      const gfx = new Graphics().circle(0, 0, fx.radius).stroke({ width: 3, color: 0xffffff });
      gfx.tint = fx.color;
      gfx.position.set(fx.x, fx.y);
      gfx.scale.set(0.2);
      this.stage.addChild(gfx);
      this.pops.push({ gfx, t: 0, dur: fx.dur, grow: 1 });
    } else {
      const gfx = new Graphics().circle(0, 0, fx.radius).fill(0xffffff);
      gfx.tint = 0xcfd2e0;
      gfx.position.set(fx.x, fx.y);
      this.stage.addChild(gfx);
      this.pops.push({ gfx, t: 0, dur: 0.22, grow: 1.8 });
    }
  }

  private updatePops(dt: number): void {
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const p = this.pops[i];
      p.t += dt;
      const k = p.t / p.dur;
      if (k >= 1) {
        p.gfx.destroy();
        this.pops.splice(i, 1);
        continue;
      }
      p.gfx.alpha = 1 - k;
      p.gfx.scale.set(0.2 + (p.grow - 0.2) * k);
    }
  }

  private drawGrid(): void {
    const g = this.gridGfx;
    const cell = 80;
    const w = this.world.worldW;
    const h = this.world.worldH;
    const left = this.world.player.x - w / 2;
    const top = this.world.player.y - h / 2;
    g.clear();
    for (let x = Math.floor(left / cell) * cell; x < left + w + cell; x += cell) {
      g.moveTo(x, top - cell).lineTo(x, top + h + cell);
    }
    for (let y = Math.floor(top / cell) * cell; y < top + h + cell; y += cell) {
      g.moveTo(left - cell, y).lineTo(left + w + cell, y);
    }
    g.stroke({ width: 1, color: 0x23232c });
  }
}

function makeEnemyGfx(e: Enemy): Graphics {
  const gfx = new Graphics();
  const radius = e.radius;
  if (e.kind === 'tank') {
    gfx.rect(-radius, -radius, radius * 2, radius * 2).fill(0xffffff);
  } else if (e.kind === 'darter') {
    // pointed sliver: reads as "fast" at a glance
    gfx.poly([radius * 1.6, 0, -radius, radius * 0.9, -radius, -radius * 0.9]).fill(0xffffff);
  } else {
    gfx.circle(0, 0, radius).fill(0xffffff);
  }
  // top band: a dark core marks the elites even mid hit-flash
  if (e.band === 3) {
    if (e.kind === 'tank') {
      gfx.rect(-radius * 0.4, -radius * 0.4, radius * 0.8, radius * 0.8).fill(0x101014);
    } else {
      gfx.circle(0, 0, radius * 0.38).fill(0x101014);
    }
  }
  gfx.tint = e.color;
  return gfx;
}

function makeProjectileGfx(pr: Projectile): Graphics {
  // Distinct silhouette per weapon (gate B: colored circles read the same).
  const gfx = new Graphics();
  switch (pr.role) {
    case 'snare': // hard-hitting bolt
      gfx.roundRect(-10, -3, 20, 6, 3).fill(0xffffff);
      break;
    case 'bass': // wide rolling wave front
      gfx.ellipse(0, 0, 16, pr.radius).fill({ color: 0xffffff, alpha: 0.5 });
      gfx.ellipse(0, 0, 16, pr.radius).stroke({ width: 2, color: 0xffffff });
      break;
    case 'lead': // homing seeker arrow
      gfx.poly([12, 0, -6, 6, -2, 0, -6, -6]).fill(0xffffff);
      break;
    default: // hat: tiny chip dot
      gfx.circle(0, 0, pr.radius).fill(0xffffff);
  }
  gfx.tint = pr.color;
  gfx.rotation = Math.atan2(pr.vy, pr.vx);
  return gfx;
}

function makeZoneGfx(z: Zone): Graphics {
  const gfx = new Graphics()
    .circle(0, 0, z.radius)
    .fill({ color: 0xffffff, alpha: 0.12 })
    .circle(0, 0, z.radius)
    .stroke({ width: 2, color: 0xffffff, alpha: 0.5 });
  gfx.tint = z.color;
  gfx.position.set(z.x, z.y);
  return gfx;
}

function makeGemGfx(g: Gem): Graphics {
  // White with a dark core: reads as "pickup", and can't be confused with
  // the hat's cyan shots (gate B feedback).
  const gfx = new Graphics()
    .rect(-4, -4, 8, 8)
    .fill(0xffffff)
    .rect(-1.5, -1.5, 3, 3)
    .fill(0x101014);
  gfx.rotation = Math.PI / 4;
  gfx.position.set(g.x, g.y);
  return gfx;
}
