// The run's renderer: everything PixiJS lives here. The world (run.ts) is
// pure simulation; this view diffs its state every frame — creating visuals
// for new entities, syncing live ones, destroying gone ones — and drains the
// world's fx queue. Headless bot runs never construct a view, which is the
// whole point of the split (docs/tools/autoplay-bot.md).

import { Container, Graphics, GraphicsContext, Text, TextStyle } from 'pixi.js';
import type { Role } from '../audio/kits';
import { RUN } from './config';
import type { Enemy, FxEvent, Gem, Projectile, RunWorld, Shock, Zone } from './run';

// Projectile trails (pure view): only these low-count roles trail, so the
// per-frame work stays independent of the 2400-enemy horde. Hat (can be
// hundreds) and arp/bass are deliberately excluded.
const TRAIL_ROLES = new Set<Role>(['snare', 'lead', 'tom']);
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

/** A death-scatter fragment: a small square of the enemy's colour that bursts
 *  outward, decelerates, and fades. The VS "vanish into pixels" feel. All
 *  fragments share one Graphics (redrawn per frame) so a crash killing dozens
 *  at once is still one draw call. View-only; never constructed headless. */
interface Pixel {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: number;
  t: number;
  dur: number;
}

// Bounded so a bass wave shredding a packed wall can't flood the frame: over
// the cap, deaths simply scatter fewer fragments.
const PIXEL_CAP = 1100;
const PIXEL_DRAG = 7; // per-second velocity ease-out (burst, then settle)

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
  private pops: Pop[] = [];
  private floaters: Floater[] = [];
  private pixels: Pixel[] = [];
  private pixelGfx = new Graphics(); // all death fragments, one batched draw
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
    this.stage.addChild(this.pixelGfx); // death fragments; re-topped each frame
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
      if (pr.role === 'tom') gfx.rotation += 9 * dt; // spin
      else if (pr.role !== 'hat') gfx.rotation = Math.atan2(pr.vy, pr.vx);
    });
    this.drawTrails();
    this.sync(this.world.zones, this.zoneGfx, makeZoneGfx, (z, gfx) => {
      gfx.alpha = Math.min(1, z.lifeS * 2);
      // The acid well visibly swirls; armed mines pulse so they read as live.
      if (z.pull > 0) gfx.rotation -= 1.6 * dt;
      else if (z.mine) gfx.scale.set(1 + 0.05 * Math.sin(this.world.timeS * 6));
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
    this.updatePixels(dt);
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
    this.pops.length = 0;
    for (const f of this.floaters) f.txt.destroy();
    this.floaters.length = 0;
    this.pixels.length = 0;
    this.trails.clear();
    this.shakes.length = 0;
    this.flashes.length = 0;
  }

  private syncEnemies(): void {
    // culling: the horde can be 2400 strong while ~300 fit on screen; the
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
      gfx.tint = e.flashT > 0 ? 0xffffff : e.color;
      // Face the direction of travel so the pointed kinds (bat/werewolf) read
      // as moving; sweep enemies point along their locked line.
      if (e.sweeping) {
        gfx.rotation = Math.atan2(e.sweepY, e.sweepX);
      } else if (e.kind === 'bat' || e.kind === 'werewolf') {
        gfx.rotation = Math.atan2(p.y - e.y, p.x - e.x);
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
      case 'whip': {
        // kick(whip): a quick rounded slash lane from the player along `angle`,
        // with a brighter leading tip. Drawn at the origin, then rotated into
        // place, so the roundRect maths stays simple. Fades fast.
        const r = fx.reach;
        const h = fx.half;
        const gfx = new Graphics();
        gfx.roundRect(0, -h, r, h * 2, h).fill({ color: 0xffffff, alpha: 0.28 });
        gfx.roundRect(r * 0.72, -h * 0.8, r * 0.28, h * 1.6, h * 0.8).fill({ color: 0xffffff, alpha: 0.5 });
        gfx.tint = fx.color;
        gfx.position.set(fx.x, fx.y);
        gfx.rotation = fx.angle;
        this.stage.addChild(gfx);
        this.pops.push({ gfx, t: 0, dur: 0.13, grow: 0 });
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
      case 'pop': {
        // Death: the enemy vanishes into a scatter of small coloured pixels
        // (the satisfying VS "break apart" feel), fronted by one quick bright
        // core flash so the kill still reads as a punch, not just confetti.
        this.spawnPixels(fx.x, fx.y, fx.radius, fx.color);
        const core = new Graphics().circle(0, 0, fx.radius * 0.85).fill(0xffffff);
        core.tint = lighten(fx.color, 0.5);
        core.position.set(fx.x, fx.y);
        core.blendMode = 'add';
        this.stage.addChild(core);
        this.pops.push({ gfx: core, t: 0, dur: 0.14, grow: 1.5 });
        break;
      }
      default:
        break;
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

  /** Scatter a burst of colour fragments where an enemy died. Count and spread
   *  scale with the enemy's size; a global cap keeps a wall-clearing hit from
   *  flooding the frame (over the cap, deaths just scatter less). */
  private spawnPixels(x: number, y: number, radius: number, color: number): void {
    const budget = PIXEL_CAP - this.pixels.length;
    if (budget <= 0) return;
    const want = Math.max(5, Math.round(radius * 0.7));
    const n = Math.min(want, budget);
    const big = radius > 16;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = (0.35 + Math.random() * 0.95) * (70 + radius * 4);
      this.pixels.push({
        x: x + (Math.random() * 2 - 1) * radius * 0.4,
        y: y + (Math.random() * 2 - 1) * radius * 0.4,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd,
        size: (big ? 3 : 2) + Math.random() * (big ? 3 : 2),
        // A third of the shards sparkle brighter so the burst reads as "energy"
        // scattering rather than a flat spray of one colour.
        color: Math.random() < 0.34 ? lighten(color, 0.55) : color,
        t: 0,
        dur: 0.32 + Math.random() * (big ? 0.28 : 0.16),
      });
    }
  }

  /** Advance and redraw every live death fragment in one batched Graphics. */
  private updatePixels(dt: number): void {
    const g = this.pixelGfx;
    g.clear();
    const drag = Math.max(0, 1 - PIXEL_DRAG * dt);
    for (let i = this.pixels.length - 1; i >= 0; i--) {
      const px = this.pixels[i];
      px.t += dt;
      const k = px.t / px.dur;
      if (k >= 1) {
        this.pixels.splice(i, 1);
        continue;
      }
      px.x += px.vx * dt;
      px.y += px.vy * dt;
      px.vx *= drag;
      px.vy *= drag;
      const alpha = k < 0.15 ? 1 : 1 - (k - 0.15) / 0.85;
      const s = px.size * (1 - k * 0.45);
      g.rect(px.x - s / 2, px.y - s / 2, s, s).fill({ color: px.color, alpha });
    }
    // Keep fragments above the horde; drawFlash re-tops the flash above these.
    if (this.pixels.length) this.stage.setChildIndex(g, this.stage.children.length - 1);
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


/** Blend a packed 0xRRGGBB colour toward white by `amt` (0..1). View-only. */
function lighten(color: number, amt: number): number {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  const lr = Math.round(r + (255 - r) * amt);
  const lg = Math.round(g + (255 - g) * amt);
  const lb = Math.round(b + (255 - b) * amt);
  return (lr << 16) | (lg << 8) | lb;
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

/** The shared GraphicsContext for an enemy's (kind, band, radius). One distinct
 *  silhouette per VS-Mad-Forest kind, so a type is read by shape + colour. */
function enemyContext(e: Enemy): GraphicsContext {
  const radius = e.radius;
  return cachedShape(`enemy:${e.kind}:${e.band}:${radius}`, (g) => {
    switch (e.kind) {
      case 'bat':
        // pointed sliver, points along travel: reads as "fast" at a glance
        g.poly([
          radius * 1.7, 0, -radius, radius * 0.85, -radius * 0.5, 0, -radius, -radius * 0.85,
        ]).fill(0xffffff);
        break;
      case 'zombie':
        // plain disc: the basic kiteable fodder
        g.circle(0, 0, radius).fill(0xffffff);
        break;
      case 'skeleton':
        // diamond: wall fodder, distinct from the zombie disc
        g.poly([0, -radius, radius, 0, 0, radius, -radius, 0]).fill(0xffffff);
        break;
      case 'ghost':
        // hollow ring with a centre dot — a wispy, very fast flanker
        g.circle(0, 0, radius).stroke({ width: 3, color: 0xffffff });
        g.circle(0, 0, radius * 0.4).fill(0xffffff);
        break;
      case 'mudman':
        // heavy hexagon: a slow mid-tank
        g.poly(regularPoly(6, radius, -Math.PI / 2)).fill(0xffffff);
        break;
      case 'werewolf':
        // aggressive forward chevron (points along travel), wider than a bat
        g.poly([
          radius * 1.4, 0, -radius * 0.8, radius * 1.1, -radius * 0.3, 0, -radius * 0.8, -radius * 1.1,
        ]).fill(0xffffff);
        break;
      case 'mantis':
        // big square: the heavy wall
        g.rect(-radius, -radius, radius * 2, radius * 2).fill(0xffffff);
        break;
      case 'elite':
        // large octagon inside a halo ring: the objective, unmistakable
        g.poly(regularPoly(8, radius, Math.PI / 8)).fill(0xffffff);
        g.circle(0, 0, radius * 1.18).stroke({ width: 3, color: 0xffffff });
        break;
      default:
        g.circle(0, 0, radius).fill(0xffffff);
    }
    // Top band / elite: a dark core, readable even mid hit-flash.
    if (e.band === 3 || e.kind === 'elite') {
      const core = e.kind === 'elite' ? 0x0a0b0f : 0x101014;
      if (e.kind === 'mantis') {
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
  // Flat cachedShape Graphics (no child nodes) to keep GPU batching intact
  // across the horde and to preserve the per-frame hit-flash tint. Kinds read
  // by shape + colour + size; the dark core / halo ring marks elites.
  return gfx;
}

function makeProjectileGfx(pr: Projectile): Graphics {
  // Distinct silhouette per weapon (gate B: colored circles read the same).
  const ctx = cachedShape(`shot:${pr.role}:${pr.radius}`, (g) => {
    switch (pr.role) {
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
      case 'hat': // chip: a tiny tracer streak, so the spray reads as motion
        g.roundRect(-6, -1.5, 12, 3, 1.5).fill(0xffffff);
        g.circle(4, 0, 2).fill(0xffffff);
        break;
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
  // Zones are the easiest weapons to confuse in a crowd (four of them are
  // "a colored circle on the floor"), so each source gets its own floor mark.
  const gfx = new Graphics();
  const r = z.radius;
  switch (z.source) {
    case 'chord': {
      // A held chord: concentric "strings" inside a filled pool.
      gfx.circle(0, 0, r).fill({ color: 0xffffff, alpha: 0.1 });
      gfx.circle(0, 0, r).stroke({ width: 2, color: 0xffffff, alpha: 0.5 });
      for (const f of [0.35, 0.6, 0.82])
        gfx.circle(0, 0, r * f).stroke({ width: 1, color: 0xffffff, alpha: 0.22 });
      break;
    }
    case 'acid': {
      // Gravity well: inward spokes around a hot core (it also slowly spins).
      gfx.circle(0, 0, r).stroke({ width: 2, color: 0xffffff, alpha: 0.5 });
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        gfx
          .moveTo(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9)
          .lineTo(Math.cos(a + 0.35) * r * 0.4, Math.sin(a + 0.35) * r * 0.4);
      }
      gfx.stroke({ width: 2, color: 0xffffff, alpha: 0.35 });
      gfx.circle(0, 0, r * 0.16).fill({ color: 0xffffff, alpha: 0.6 });
      break;
    }
    case 'rhodes': {
      // Armed mine: a bright core with tick marks inside a faint trip ring.
      gfx.circle(0, 0, r).stroke({ width: 1.5, color: 0xffffff, alpha: 0.3 });
      gfx.circle(0, 0, 9).fill(0xffffff);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        gfx
          .moveTo(Math.cos(a) * 14, Math.sin(a) * 14)
          .lineTo(Math.cos(a) * 24, Math.sin(a) * 24);
      }
      gfx.stroke({ width: 3, color: 0xffffff, alpha: 0.9 });
      break;
    }
    case 'shaker': {
      // Trail blob: soft, edgeless — it should read as residue, not a zone.
      gfx.circle(0, 0, r).fill({ color: 0xffffff, alpha: 0.16 });
      gfx.circle(0, 0, r * 0.55).fill({ color: 0xffffff, alpha: 0.14 });
      break;
    }
    default: {
      gfx.circle(0, 0, r).fill({ color: 0xffffff, alpha: 0.12 });
      gfx.circle(0, 0, r).stroke({ width: 2, color: 0xffffff, alpha: 0.5 });
    }
  }
  gfx.tint = z.color;
  gfx.position.set(z.x, z.y);
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
