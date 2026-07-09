// The run's renderer: everything PixiJS lives here. The world (run.ts) is
// pure simulation; this view diffs its state every frame — creating visuals
// for new entities, syncing live ones, destroying gone ones — and drains the
// world's fx queue. Headless bot runs never construct a view, which is the
// whole point of the split (docs/tools/autoplay-bot.md).

import { Container, Graphics, GraphicsContext, Text, TextStyle } from 'pixi.js';
import type { Role } from '../audio/kits';
import { CHARGER, DARTER, RUN } from './config';
import type { Enemy, FxEvent, Gem, Projectile, RunWorld, Shock, WhistleTag, Zone } from './run';

// Projectile trails (pure view): only these low-count roles trail, so the
// per-frame work stays independent of the 2400-enemy horde. Hat (can be
// hundreds) and the broad bass wave is deliberately excluded.
const TRAIL_ROLES = new Set<Role>(['lead']);
const TRAIL_LEN = 6; // points kept per trail

// Shared geometry (M2 sub-phase C, frame rate above ~2000 alive): every
// enemy of a (kind, band) is the same shape, so all their Graphics share
// one prebuilt GraphicsContext instead of each owning geometry — the GPU
// batches them. Cached at module level; contexts are tiny and survive
// across runs.
const shapeCache = new Map<string, GraphicsContext>();

function cachedShape(key: string, draw: (ctx: GraphicsContext) => void): GraphicsContext {
  let ctx = shapeCache.get(key);
  if (!ctx) {
    ctx = new GraphicsContext();
    draw(ctx);
    shapeCache.set(key, ctx);
  }
  return ctx;
}

// Shared glow language (D4): an entity's solid fill (batched by cachedShape)
// plus an optional additive glow child. Only bounded-count entities (player,
// gems, elites, low-count roles, fx) take a glow — the 2400-strong horde stays
// flat to preserve GPU batching.
export const GLOW = { alpha: 0.28, scale: 1.8, blend: 'add' as const };
export function makeGlow(radius: number, color: number): Graphics {
  const g = new Graphics(cachedShape(`glow:${radius}`, (c) => c.circle(0, 0, radius).fill(0xffffff)));
  g.tint = color;
  g.alpha = GLOW.alpha;
  g.blendMode = GLOW.blend;
  return g;
}

interface Pop {
  gfx: Graphics;
  t: number;
  dur: number;
  grow: number;
}

/** A floating damage number: rises and fades where a hit landed. */
interface Floater {
  txt: Text;
  x: number;
  y: number;
  t: number;
  dur: number;
  vy: number;
}

// Damage numbers stay a quiet layer of feedback, not a wall of text: a hard cap
// keeps the horde's hits from flooding the screen (and the CPU), and off-screen
// hits never spawn one at all.
const DMG_CAP = 100;
const DMG_DUR = 0.6;
const DMG_RISE = 34; // px/s upward drift
const DMG_STYLE = new TextStyle({
  fontFamily: 'system-ui, sans-serif',
  fontSize: 13,
  fontWeight: '500',
  fill: 0xffffff,
});

export class RunView {
  readonly stage: Container;

  private world: RunWorld;
  private view: { width: number; height: number };

  private gridGfx = new Graphics();
  private trailGfx = new Graphics();
  private flashGfx = new Graphics();
  // The player is a Container (additive glow child + white core + signal ring);
  // only its .position/.alpha are ever touched, matching the old Graphics.
  private playerGfx = new Container();
  private enemyGfx = new Map<Enemy, Graphics>();
  private projectileGfx = new Map<Projectile, Graphics>();
  private zoneGfx = new Map<Zone, Graphics>();
  private shockGfx = new Map<Shock, Graphics>();
  private gemGfx = new Map<Gem, Container>();
  private tagGfx = new Map<WhistleTag, Graphics>();
  private pops: Pop[] = [];
  private floaters: Floater[] = [];
  private live = new Set<object>();

  // Shared view-only feel systems (Feature 3). All decay off world.timeS,
  // which advances in fixed sim steps during replay/seek, so a jump leaves
  // zero residue (game clears world.fx on jumps). Never constructed headless.
  private shakes: { start: number; mag: number; dur: number }[] = [];
  private flashes: { start: number; dur: number; color: number; alpha: number }[] = [];
  private trails = new Map<Projectile, number[]>(); // flattened [x,y,...], newest last

  constructor(world: RunWorld, view: { width: number; height: number }) {
    this.world = world;
    this.view = view;
    this.stage = new Container();
    this.stage.addChild(this.gridGfx);
    this.stage.addChild(this.trailGfx); // below entities (added dynamically later)
    // Player token: signal glow behind a white core with a signal ring.
    const glow = makeGlow(22, 0x59ffd1);
    glow.alpha = 0.3;
    const body = new Graphics();
    body.circle(0, 0, RUN.playerRadius).fill(0xffffff);
    body.circle(0, 0, RUN.playerRadius + 3).stroke({ width: 2, color: 0x59ffd1, alpha: 0.9 });
    this.playerGfx.addChild(glow, body);
    this.stage.addChild(this.playerGfx);
    this.stage.addChild(this.flashGfx); // re-topped each active frame
  }

  /** Route a screenshake in from outside the fx queue (e.g. Feature 1's
   *  player-hit shake) — the single shake system (D5). */
  pushShake(mag: number, dur: number): void {
    this.shakes.push({ start: this.world.timeS, mag, dur });
  }

  /** Level-up flourish: a signal-colored ring that expands and fades from
   *  (x,y). View-only (rides the pops list), never called headless. */
  flourish(x: number, y: number): void {
    const g = new Graphics().circle(0, 0, 30).stroke({ width: 4, color: 0xffffff });
    g.tint = 0x59ffd1;
    g.position.set(x, y);
    g.scale.set(0.2);
    g.blendMode = 'add';
    this.stage.addChild(g);
    this.pops.push({ gfx: g, t: 0, dur: 0.7, grow: 9 });
  }

  /** Sync visuals to the world. Call once per frame, after world.update. */
  update(dt: number): void {
    for (const fx of this.world.fx ?? []) this.spawnFx(fx);
    if (this.world.fx) this.world.fx.length = 0;

    this.syncEnemies();
    this.sync(this.world.projectiles, this.projectileGfx, makeProjectileGfx, (pr, gfx) => {
      gfx.position.set(pr.x, pr.y);
      if (pr.role === 'tom' || pr.role === 'cowbell') gfx.rotation += 9 * dt; // spin
      else if (pr.role !== 'hat') gfx.rotation = Math.atan2(pr.vy, pr.vx);
    });
    this.drawTrails();
    this.sync(this.world.zones, this.zoneGfx, makeZoneGfx, (z, gfx) => {
      gfx.alpha = Math.min(1, z.lifeS * 2);
      if (z.source === 'acid') gfx.rotation += dt * 0.9;
    });
    // Whistle tags: a reticle that rides the marked enemy and tightens as the
    // pop nears (view-only cue; the pop itself is a sim event with its own fx).
    this.sync(this.world.tags, this.tagGfx, makeTagGfx, (t, gfx) => {
      gfx.position.set(t.x, t.y);
      const remain = Math.max(0, t.popAtS - this.world.timeS);
      gfx.scale.set(0.5 + remain * 1.5); // wide when fresh, tight at the pop
      gfx.rotation += dt * 4;
    });
    this.syncShocks();
    const p = this.world.player;
    const cullW = this.world.worldW / 2 + 40;
    const cullH = this.world.worldH / 2 + 40;
    this.sync(this.world.gems, this.gemGfx, makeGemGfx, (g, gfx) => {
      const visible = Math.abs(g.x - p.x) < cullW && Math.abs(g.y - p.y) < cullH;
      gfx.renderable = visible;
      if (visible) gfx.position.set(g.x, g.y);
    });
    this.updatePops(dt);
    this.updateFloaters(dt);
    this.drawGrid();
    this.drawFlash();

    // Screenshake: decay each active shake off world.timeS (fixed sim steps
    // in replay/seek, so no residue after a jump) and take the peak amplitude.
    // The jitter direction uses Math.random — view is never headless, so this
    // never touches the sim or the bot.
    let amp = 0;
    for (let i = this.shakes.length - 1; i >= 0; i--) {
      const s = this.shakes[i];
      const k = (this.world.timeS - s.start) / s.dur;
      if (k >= 1 || k < 0) {
        this.shakes.splice(i, 1);
        continue;
      }
      amp = Math.max(amp, s.mag * (1 - k));
    }
    const sx = amp ? (Math.random() * 2 - 1) * amp : 0;
    const sy = amp ? (Math.random() * 2 - 1) * amp : 0;

    // camera locked on player, scaled for the screen
    const zoom = this.world.zoom;
    this.stage.scale.set(zoom);
    this.stage.position.set(
      this.view.width / 2 - p.x * zoom + sx,
      this.view.height / 2 - p.y * zoom + sy,
    );
    this.playerGfx.position.set(p.x, p.y);
    this.playerGfx.alpha = p.iframesT > 0 ? 0.5 : 1;
  }

  destroy(): void {
    this.stage.destroy({ children: true });
    this.enemyGfx.clear();
    this.projectileGfx.clear();
    this.zoneGfx.clear();
    this.shockGfx.clear();
    this.gemGfx.clear();
    this.tagGfx.clear();
    this.pops.length = 0;
    for (const f of this.floaters) f.txt.destroy();
    this.floaters.length = 0;
    this.trails.clear();
    this.shakes.length = 0;
    this.flashes.length = 0;
  }

  private syncEnemies(): void {
    // Culling: the authored horde can exceed what fits on screen; the
    // rest skip rendering entirely (the sim is untouched, they still chase)
    const p = this.world.player;
    const cullW = this.world.worldW / 2 + 80;
    const cullH = this.world.worldH / 2 + 80;
    this.live.clear();
    for (const e of this.world.enemies) {
      let gfx = this.enemyGfx.get(e);
      if (!gfx) {
        gfx = makeEnemyGfx(e);
        this.enemyGfx.set(e, gfx);
        this.stage.addChild(gfx);
      }
      this.live.add(e);
      const visible = Math.abs(e.x - p.x) < cullW && Math.abs(e.y - p.y) < cullH;
      gfx.renderable = visible;
      if (!visible) continue;
      gfx.position.set(e.x, e.y);
      // A warm swell is the muted tell for both dash enemies. Hit-flash wins,
      // then the tell, then ride's frozen tint.
      gfx.tint = e.flashT > 0 ? 0xffffff : e.windupT > 0 ? 0xffd166 : e.frozenT > 0 ? 0xbfeaff : e.color;
      if ((e.kind === 'darter' || e.kind === 'charger') && (e.dashX !== 0 || e.dashY !== 0)) {
        gfx.rotation = Math.atan2(e.dashY, e.dashX);
      }
      if (e.windupT > 0 && (e.kind === 'darter' || e.kind === 'charger')) {
        const tellS = e.kind === 'darter' ? DARTER.tellS : CHARGER.windupS;
        const ready = Math.max(0, Math.min(1, 1 - e.windupT / tellS));
        gfx.scale.set(1 + ready * 0.28);
        gfx.alpha = 0.65 + ready * 0.35;
      } else {
        gfx.scale.set(1);
        gfx.alpha = 1;
      }
    }
    for (const [e, gfx] of this.enemyGfx) {
      if (!this.live.has(e)) {
        gfx.destroy({ children: true }); // frees an elite's glow child; shared context survives
        this.enemyGfx.delete(e);
      }
    }
  }

  /** Generic diff for the simpler entity kinds. */
  private sync<T extends object, G extends Container>(
    entities: readonly T[],
    map: Map<T, G>,
    make: (entity: T) => G,
    apply: (entity: T, gfx: G) => void,
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
        gfx.destroy({ children: true }); // frees a gem's glow bead; shared context survives
        map.delete(entity);
      }
    }
  }

  /** Shockwaves grow every frame, so they are redrawn rather than diffed. */
  private syncShocks(): void {
    this.live.clear();
    for (const s of this.world.shocks) {
      let gfx = this.shockGfx.get(s);
      if (!gfx) {
        gfx = new Graphics();
        this.stage.addChild(gfx);
        this.shockGfx.set(s, gfx);
      }
      gfx.clear();
      gfx.circle(s.x, s.y, s.radius).stroke({ width: 6, color: 0xffffff, alpha: 0.85 });
      gfx.tint = s.color;
      gfx.alpha = Math.max(0, 1 - s.radius / s.maxRadius);
      this.live.add(s);
    }
    for (const [s, gfx] of this.shockGfx) {
      if (!this.live.has(s)) {
        gfx.destroy();
        this.shockGfx.delete(s);
      }
    }
  }

  private spawnFx(fx: FxEvent): void {
    switch (fx.type) {
      case 'ring': {
        const gfx = new Graphics();
        if (fx.soft) {
          // Quiet ambient pulse (the kick, every beat): one thin, faint ring.
          gfx.circle(0, 0, fx.radius).stroke({ width: 1.5, color: 0xffffff, alpha: 0.4 });
        } else {
          // Doubled shock: an outer ring plus a fainter inner one.
          gfx
            .circle(0, 0, fx.radius)
            .stroke({ width: 3, color: 0xffffff })
            .circle(0, 0, fx.radius * 0.6)
            .stroke({ width: 2, color: 0xffffff, alpha: 0.5 });
        }
        gfx.tint = fx.color;
        gfx.position.set(fx.x, fx.y);
        gfx.scale.set(0.2);
        this.stage.addChild(gfx);
        this.pops.push({ gfx, t: 0, dur: fx.dur, grow: 1 });
        break;
      }
      case 'arc': {
        // clap: a filled wedge in the slash direction, fading in place
        const gfx = new Graphics()
          .moveTo(fx.x, fx.y)
          .arc(fx.x, fx.y, fx.radius, fx.angle - fx.arc, fx.angle + fx.arc)
          .lineTo(fx.x, fx.y)
          .fill({ color: 0xffffff, alpha: 0.35 });
        gfx.tint = fx.color;
        this.stage.addChild(gfx);
        this.pops.push({ gfx, t: 0, dur: 0.16, grow: 0 });
        break;
      }
      case 'bolt': {
        // zap: a lightning line from the player to the struck enemy
        const gfx = new Graphics()
          .moveTo(fx.x1, fx.y1)
          .lineTo(fx.x2, fx.y2)
          .stroke({ width: 3, color: 0xffffff, alpha: 0.9 });
        gfx.tint = fx.color;
        this.stage.addChild(gfx);
        this.pops.push({ gfx, t: 0, dur: 0.14, grow: 0 });
        break;
      }
      case 'shake':
        // Firing is deterministic (a sim event); the decay reads world.timeS.
        this.shakes.push({ start: this.world.timeS, mag: fx.mag, dur: fx.dur });
        break;
      case 'flash':
        this.flashes.push({ start: this.world.timeS, dur: fx.dur, color: fx.color, alpha: fx.alpha });
        break;
      case 'spark': {
        // A short radial burst of lines; scales up as it fades.
        const gfx = new Graphics();
        for (let i = 0; i < fx.n; i++) {
          const a = Math.random() * Math.PI * 2;
          const len = fx.spread * (0.5 + Math.random() * 0.5);
          gfx.moveTo(0, 0).lineTo(Math.cos(a) * len, Math.sin(a) * len);
        }
        gfx.stroke({ width: 2, color: 0xffffff, alpha: 0.9 });
        gfx.tint = fx.color;
        gfx.position.set(fx.x, fx.y);
        this.stage.addChild(gfx);
        this.pops.push({ gfx, t: 0, dur: 0.18, grow: 1.3 });
        break;
      }
      case 'slam': {
        // Ground stomp: a filled core disc inside a thick ring.
        const gfx = new Graphics();
        gfx.circle(0, 0, fx.radius * 0.5).fill(0xffffff);
        gfx.circle(0, 0, fx.radius).stroke({ width: 6, color: 0xffffff });
        gfx.tint = fx.color;
        gfx.position.set(fx.x, fx.y);
        this.stage.addChild(gfx);
        this.pops.push({ gfx, t: 0, dur: 0.28, grow: 1.6 });
        break;
      }
      case 'zigbolt': {
        // Jagged main bolt plus a few short forks off it (grow:0 -> no scale,
        // geometry is absolute world coords).
        const gfx = new Graphics();
        drawZig(gfx, fx.x1, fx.y1, fx.x2, fx.y2, 5);
        for (let b = 0; b < fx.branches; b++) {
          const t = 0.3 + Math.random() * 0.5;
          const mx = fx.x1 + (fx.x2 - fx.x1) * t;
          const my = fx.y1 + (fx.y2 - fx.y1) * t;
          const a = Math.random() * Math.PI * 2;
          const len = 18 + Math.random() * 14;
          drawZig(gfx, mx, my, mx + Math.cos(a) * len, my + Math.sin(a) * len, 3);
        }
        gfx.stroke({ width: 3, color: 0xffffff, alpha: 0.95 });
        gfx.tint = fx.color;
        this.stage.addChild(gfx);
        this.pops.push({ gfx, t: 0, dur: 0.14, grow: 0 });
        break;
      }
      case 'dmg': {
        // Floating damage number. Bounded by DMG_CAP and culled off-screen so
        // the horde's hits never become a wall of text.
        if (this.floaters.length >= DMG_CAP) break;
        const p = this.world.player;
        if (Math.abs(fx.x - p.x) > this.world.worldW / 2 + 40) break;
        if (Math.abs(fx.y - p.y) > this.world.worldH / 2 + 40) break;
        const txt = new Text({ text: String(fx.amount), style: DMG_STYLE });
        txt.anchor.set(0.5);
        txt.tint = fx.color;
        const x = fx.x + (Math.random() * 2 - 1) * 6;
        txt.position.set(x, fx.y);
        this.stage.addChild(txt);
        this.floaters.push({ txt, x, y: fx.y, t: 0, dur: DMG_DUR, vy: DMG_RISE });
        break;
      }
      default: {
        // pop: a fading disc where something died
        const gfx = new Graphics().circle(0, 0, fx.radius).fill(0xffffff);
        gfx.tint = 0xcfd2e0;
        gfx.position.set(fx.x, fx.y);
        this.stage.addChild(gfx);
        this.pops.push({ gfx, t: 0, dur: 0.22, grow: 1.8 });
        // Bigger deaths (tanks, elites) throw a small spark burst.
        if (fx.radius > 16)
          this.spawnFx({ type: 'spark', x: fx.x, y: fx.y, color: 0xcfd2e0, n: 4, spread: 14 });
      }
    }
  }

  private updateFloaters(dt: number): void {
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.t += dt;
      const k = f.t / f.dur;
      if (k >= 1) {
        f.txt.destroy();
        this.floaters.splice(i, 1);
        continue;
      }
      f.y -= f.vy * dt;
      f.txt.position.set(f.x, f.y);
      // Hold full opacity briefly, then fade out over the back half.
      f.txt.alpha = k < 0.4 ? 1 : 1 - (k - 0.4) / 0.6;
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
      if (p.grow > 0) p.gfx.scale.set(0.2 + (p.grow - 0.2) * k);
    }
  }

  /** Redraw every projectile trail in one Graphics (below entities). Bounded
   *  to TRAIL_ROLES, ~6 segments each; independent of the horde size. */
  private drawTrails(): void {
    this.trailGfx.clear();
    const liveTrails = new Set<Projectile>();
    for (const pr of this.world.projectiles) {
      if (!TRAIL_ROLES.has(pr.role)) continue;
      liveTrails.add(pr);
      let buf = this.trails.get(pr);
      if (!buf) {
        buf = [];
        this.trails.set(pr, buf);
      }
      buf.push(pr.x, pr.y);
      if (buf.length > TRAIL_LEN * 2) buf.splice(0, buf.length - TRAIL_LEN * 2);
      for (let i = 2; i < buf.length; i += 2) {
        const a = i / buf.length; // fade tail -> head
        this.trailGfx
          .moveTo(buf[i - 2], buf[i - 1])
          .lineTo(buf[i], buf[i + 1])
          .stroke({ width: 2 + 2 * a, color: pr.color, alpha: 0.35 * a });
      }
    }
    for (const pr of this.trails.keys()) if (!liveTrails.has(pr)) this.trails.delete(pr);
  }

  /** Full-screen colored flash: a world-space rect sized to the visible
   *  extent, kept on top. Peak alpha of the strongest active flash. */
  private drawFlash(): void {
    this.flashGfx.clear();
    let fa = 0;
    let fc = 0xffffff;
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      const k = (this.world.timeS - f.start) / f.dur;
      if (k >= 1 || k < 0) {
        this.flashes.splice(i, 1);
        continue;
      }
      const a = f.alpha * (1 - k);
      if (a > fa) {
        fa = a;
        fc = f.color;
      }
    }
    if (fa > 0) {
      const p = this.world.player;
      const w = this.world.worldW;
      const h = this.world.worldH;
      this.flashGfx.rect(p.x - w / 2, p.y - h / 2, w, h).fill(0xffffff);
      this.flashGfx.tint = fc;
      this.flashGfx.alpha = fa;
      this.stage.setChildIndex(this.flashGfx, this.stage.children.length - 1);
    } else {
      this.flashGfx.alpha = 0;
    }
  }

  private drawGrid(): void {
    // Two-tier sequencer grid: dim minor lines every cell, brighter "bar"
    // lines every 4 cells. Each tier is one stroke() over its own batch.
    const g = this.gridGfx;
    const cell = 80;
    const major = 320; // a bar: every 4 cells; aligns to floor(x/major)*major
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
    g.stroke({ width: 1, color: 0x161a24 });
    for (let x = Math.floor(left / major) * major; x < left + w + major; x += major) {
      g.moveTo(x, top - major).lineTo(x, top + h + major);
    }
    for (let y = Math.floor(top / major) * major; y < top + h + major; y += major) {
      g.moveTo(left - major, y).lineTo(left + w + major, y);
    }
    g.stroke({ width: 1, color: 0x232a38 });
  }
}

/** Build a jagged polyline from (x1,y1)->(x2,y2) into `g` (subpath only; the
 *  caller strokes). Midpoints jitter perpendicular to the line — view-only,
 *  so Math.random is fine. */
function drawZig(g: Graphics, x1: number, y1: number, x2: number, y2: number, segs: number): void {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const px = -dy / len;
  const py = dx / len;
  g.moveTo(x1, y1);
  for (let i = 1; i < segs; i++) {
    const t = i / segs;
    const off = (Math.random() * 2 - 1) * 12;
    g.lineTo(x1 + dx * t + px * off, y1 + dy * t + py * off);
  }
  g.lineTo(x2, y2);
}

/** Regular n-gon vertices as a flat [x,y,...] list (view-only geometry). */
function regularPoly(sides: number, r: number, rot = 0): number[] {
  const pts: number[] = [];
  for (let i = 0; i < sides; i++) {
    const a = rot + (i / sides) * Math.PI * 2;
    pts.push(Math.cos(a) * r, Math.sin(a) * r);
  }
  return pts;
}

/** The shared GraphicsContext for an enemy's (kind, band, radius). */
function enemyContext(e: Enemy): GraphicsContext {
  const radius = e.radius;
  return cachedShape(`enemy:${e.kind}:${e.band}:${radius}`, (g) => {
    switch (e.kind) {
      case 'tank':
        g.rect(-radius, -radius, radius * 2, radius * 2).fill(0xffffff);
        break;
      case 'darter':
        // pointed sliver: reads as "fast" at a glance
        g.poly([radius * 1.6, 0, -radius, radius * 0.9, -radius, -radius * 0.9]).fill(0xffffff);
        break;
      case 'splitter':
        // hexagon: reads as "will burst"
        g.poly(regularPoly(6, radius, -Math.PI / 2)).fill(0xffffff);
        break;
      case 'charger':
        // fat forward chevron/bull, wider than the darter's sliver
        g.poly([
          radius * 1.4,
          0,
          -radius * 0.8,
          radius * 1.1,
          -radius * 0.3,
          0,
          -radius * 0.8,
          -radius * 1.1,
        ]).fill(0xffffff);
        break;
      case 'elite':
        // large octagon: the objective, unmistakable by size and shape
        g.poly(regularPoly(8, radius, Math.PI / 8)).fill(0xffffff);
        break;
      default:
        g.circle(0, 0, radius).fill(0xffffff);
    }
    // top band: a dark core marks the elites even mid hit-flash; the elite
    // kind carries the core at every band (using the new arena black).
    if (e.band === 3 || e.kind === 'elite') {
      const core = e.kind === 'elite' ? 0x0a0b0f : 0x101014;
      if (e.kind === 'tank') {
        g.rect(-radius * 0.4, -radius * 0.4, radius * 0.8, radius * 0.8).fill(core);
      } else {
        g.circle(0, 0, radius * 0.38).fill(core);
      }
    }
  });
}

function makeEnemyGfx(e: Enemy): Graphics {
  const gfx = new Graphics(enemyContext(e));
  gfx.tint = e.color;
  // Enemies stay flat cachedShape Graphics (no child nodes) to keep GPU
  // batching intact across the full horde and to preserve the per-frame
  // hit-flash tint. Elites read as elite through size, the hottest band color,
  // and the dark core — no glow child (which Pixi v8 disallows on a Graphics).
  return gfx;
}

function makeProjectileGfx(pr: Projectile): Graphics {
  // Distinct silhouette per weapon (gate B: colored circles read the same).
  const ctx = cachedShape(`shot:${pr.role}:${pr.radius}`, (g) => {
    switch (pr.role) {
      case 'hat': // a thin metallic needle, readable even in a dense volley
        g.poly([11, 0, -5, 2.2, -8, 0, -5, -2.2]).fill(0xffffff);
        break;
      case 'snare': // hard-hitting bolt with a bright leading tip
        g.roundRect(-10, -3, 20, 6, 3).fill(0xffffff);
        g.rect(8, -3, 4, 6).fill(0xffffff);
        break;
      case 'bass': // wide rolling wave front
        g.ellipse(0, 0, 16, pr.radius).fill({ color: 0xffffff, alpha: 0.5 });
        g.ellipse(0, 0, 16, pr.radius).stroke({ width: 2, color: 0xffffff });
        break;
      case 'lead': // homing seeker arrow with a small tail notch
        g.poly([12, 0, -6, 6, -2, 0, -6, -6]).fill(0xffffff);
        g.poly([-6, 3, -10, 0, -6, -3]).fill(0xffffff);
        break;
      case 'tom': // boomerang: a fat chevron pointing where it flies
        g.poly([13, 0, -7, 9, -1, 0, -7, -9]).fill(0xffffff);
        break;
      case 'cowbell': {
        // ricochet: a metallic diamond
        const r = pr.radius;
        g.poly([r * 2.4, 0, 0, r * 1.7, -r * 2.4, 0, 0, -r * 1.7]).fill(0xffffff);
        break;
      }
      case 'arp': // orbiter: a bead with a ring
        g.circle(0, 0, pr.radius).stroke({ width: 3, color: 0xffffff });
        g.circle(0, 0, pr.radius * 0.45).fill(0xffffff);
        break;
      case 'pluck': // lobbed note: a small round bead (radius is the blast, not the shot)
        g.circle(0, 0, 7).fill(0xffffff);
        g.circle(0, 0, 3.5).fill(0x000000);
        break;
      case 'bell': {
        // twinkly note: a small four-point sparkle (shards reuse this at their
        // tiny radius, so they read as fragments of the same note)
        const r = Math.max(4, pr.radius);
        g.poly([r * 1.5, 0, r * 0.4, r * 0.4, 0, r * 1.5, -r * 0.4, r * 0.4,
          -r * 1.5, 0, -r * 0.4, -r * 0.4, 0, -r * 1.5, r * 0.4, -r * 0.4]).fill(0xffffff);
        break;
      }
      default:
        g.circle(0, 0, pr.radius).fill(0xffffff);
    }
  });
  const gfx = new Graphics(ctx);
  gfx.tint = pr.color;
  gfx.rotation = Math.atan2(pr.vy, pr.vx);
  return gfx;
}

function makeZoneGfx(z: Zone): Graphics {
  const gfx = new Graphics();
  switch (z.source) {
    case 'shaker': {
      // A fading footprint/pool: several small grains make the movement trail
      // distinct from the larger persistent control fields.
      gfx.circle(0, 0, z.radius).fill({ color: 0xffffff, alpha: 0.1 });
      for (const [x, y, r] of [
        [-0.36, -0.12, 0.12],
        [0.1, -0.3, 0.09],
        [0.34, 0.12, 0.11],
        [-0.08, 0.3, 0.08],
      ] as const) {
        gfx.circle(x * z.radius, y * z.radius, r * z.radius).fill({ color: 0xffffff, alpha: 0.55 });
      }
      break;
    }
    case 'acid': {
      // Rotating vortex: offset inner rings and spokes imply inward pull.
      gfx.circle(0, 0, z.radius).fill({ color: 0xffffff, alpha: 0.1 });
      gfx.circle(0, 0, z.radius).stroke({ width: 2, color: 0xffffff, alpha: 0.6 });
      gfx.circle(z.radius * 0.13, 0, z.radius * 0.58).stroke({ width: 2, color: 0xffffff, alpha: 0.42 });
      gfx.circle(-z.radius * 0.08, 0, z.radius * 0.28).stroke({ width: 2, color: 0xffffff, alpha: 0.55 });
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        gfx.moveTo(Math.cos(a) * z.radius * 0.3, Math.sin(a) * z.radius * 0.3)
          .lineTo(Math.cos(a + 0.55) * z.radius * 0.82, Math.sin(a + 0.55) * z.radius * 0.82);
      }
      gfx.stroke({ width: 1.5, color: 0xffffff, alpha: 0.35 });
      break;
    }
    case 'chord': {
      // Segmented harmony field: four broken arcs, visibly different from an
      // Acid vortex even when colors are hard to distinguish.
      gfx.circle(0, 0, z.radius).fill({ color: 0xffffff, alpha: 0.09 });
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        gfx.arc(0, 0, z.radius, a + 0.12, a + Math.PI / 2 - 0.12);
      }
      gfx.stroke({ width: 3, color: 0xffffff, alpha: 0.58 });
      gfx.poly(regularPoly(6, z.radius * 0.48, Math.PI / 6))
        .stroke({ width: 1.5, color: 0xffffff, alpha: 0.32 });
      break;
    }
    case 'rhodes': {
      // Armed mine: a compact diamond target inside its faint trigger radius.
      const r = Math.min(24, z.radius * 0.34);
      gfx.circle(0, 0, z.radius).fill({ color: 0xffffff, alpha: 0.05 });
      gfx.circle(0, 0, z.radius).stroke({ width: 1, color: 0xffffff, alpha: 0.25 });
      gfx.poly([0, -r, r, 0, 0, r, -r, 0]).fill({ color: 0xffffff, alpha: 0.24 });
      gfx.poly([0, -r, r, 0, 0, r, -r, 0]).stroke({ width: 2, color: 0xffffff, alpha: 0.8 });
      gfx.circle(0, 0, r * 0.24).fill(0xffffff);
      break;
    }
    default:
      gfx.circle(0, 0, z.radius)
        .fill({ color: 0xffffff, alpha: 0.12 })
        .circle(0, 0, z.radius)
        .stroke({ width: 2, color: 0xffffff, alpha: 0.5 });
  }
  gfx.tint = z.color;
  gfx.position.set(z.x, z.y);
  return gfx;
}

function makeTagGfx(t: WhistleTag): Graphics {
  // A reticle: four corner brackets around a small ring, marking the doomed
  // enemy. Geometry is unit-ish; the sync scales/rotates it per frame.
  const gfx = new Graphics();
  const r = 16;
  gfx.circle(0, 0, r * 0.4).stroke({ width: 2, color: 0xffffff, alpha: 0.9 });
  for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const cx = Math.cos(a) * r;
    const cy = Math.sin(a) * r;
    const px = -Math.sin(a);
    const py = Math.cos(a);
    gfx
      .moveTo(cx - px * 5, cy - py * 5)
      .lineTo(cx, cy)
      .lineTo(cx + px * 5, cy + py * 5)
      .stroke({ width: 2, color: 0xffffff, alpha: 0.9 });
  }
  gfx.tint = t.color;
  return gfx;
}

function makeGemGfx(g: Gem): Container {
  // Signal-tinted diamond with a dark core, plus a faint additive glow bead so
  // XP reads as "energy". A Container holds the (tinted, shared-context) body
  // and the glow — Pixi v8 only allows children on Containers, and gems are
  // bounded/culled so the extra node is cheap.
  const ctx = cachedShape('gem', (c) => {
    c.rect(-4, -4, 8, 8).fill(0xffffff).rect(-1.5, -1.5, 3, 3).fill(0x0a0b0f);
  });
  const body = new Graphics(ctx);
  body.tint = 0x59ffd1;
  body.rotation = Math.PI / 4;
  const glow = makeGlow(6, 0x59ffd1);
  glow.alpha = 0.35;
  const c = new Container();
  c.addChild(glow, body);
  c.position.set(g.x, g.y);
  return c;
}
