// The run's renderer: everything PixiJS lives here. The world (run.ts) is
// pure simulation; this view diffs its state every frame — creating visuals
// for new entities, syncing live ones, destroying gone ones — and drains the
// world's fx queue.

import { Container, Graphics, GraphicsContext, Text, TextStyle } from 'pixi.js';
import type { Role } from '../audio/kits';
import { RUN } from './config';
import { drawWeaponIcon } from './weaponicons';
import {
  KICK_GEOMETRY,
  PLAYER_FOOT_OFFSET,
  type Enemy,
  type FxEvent,
  type Gem,
  type Projectile,
  type RunWorld,
  type Zone,
} from './run';

// Projectile trails (pure view): only these low-count roles trail, so the
// per-frame work stays independent of the capped horde. Hat (can be
// hundreds) and arp/bass are deliberately excluded.
const TRAIL_ROLES = new Set<Role>(['snare', 'lead']);
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
// gems, elites, low-count roles, fx) take a glow — the horde stays
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
  /** Deaths redraw one bounded, batched square-fragment burst as it disperses. */
  death?: DeathBurst;
  /** Whip holds at full opacity for 100 ms, then fades for 100 ms. */
  holdHalf?: boolean;
  /** Whip grows from zero to full body scale during its first 100 ms. */
  expandHalf?: boolean;
}

interface DeathFragment {
  x: number;
  y: number;
  dx: number;
  dy: number;
  size: number;
}

interface DeathBurst {
  radius: number;
  elite: boolean;
  fragments: DeathFragment[];
}

/** A mass clear can kill hundreds in one frame. Keep death juice satisfying
 * near the player without turning it into the new horde-sized render cost. */
const DEATH_BURST_CAP = 80;
const REGULAR_DEATH_BURST_CAP = 72; // reserve a few slots for rare elite finishes

/** The sim sends Whip's VS-style Area multiplier (1 = 258 x 39 in this
 * reference view). Object forms remain accepted for sandbox visual probes. */
function whipDimensions(area: unknown): { width: number; height: number; offset: number } {
  if (typeof area === 'number' && Number.isFinite(area)) {
    const scale = Math.max(0.1, area);
    // Match the sim hitbox exactly so the drawn strip is the real footprint.
    return { width: KICK_GEOMETRY.baseWidth * scale, height: KICK_GEOMETRY.baseHeight * scale, offset: 0 };
  }
  const a = area && typeof area === 'object' ? (area as Record<string, unknown>) : {};
  const num = (...keys: string[]): number | undefined => {
    for (const key of keys) {
      const value = a[key];
      if (typeof value === 'number' && Number.isFinite(value)) return value;
    }
    return undefined;
  };
  const width = Math.max(24, num('width', 'w', 'reach') ?? 150);
  const height = Math.max(12, num('height', 'h', 'thickness') ?? width * 0.28);
  const offset = Math.max(0, num('offset', 'offsetX', 'start') ?? 12);
  return { width, height, offset };
}

function makeDeathBurst(
  radius: number,
  color: number,
  elite: boolean,
): { gfx: Graphics; burst: DeathBurst } {
  const fragments: DeathFragment[] = [];
  const count = elite
    ? Math.min(38, Math.max(26, Math.round(radius)))
    : Math.min(20, Math.max(11, Math.round(radius * 0.9)));
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const startR = radius * (0.12 + Math.random() * 0.62);
    const travel = radius * (elite ? 2 + Math.random() * 1.7 : 1.5 + Math.random() * 1.5);
    fragments.push({
      x: Math.cos(angle) * startR,
      y: Math.sin(angle) * startR,
      dx: Math.cos(angle) * travel,
      dy: Math.sin(angle) * travel,
      size: Math.max(2.5, Math.min(elite ? 8 : 6, radius * (0.18 + Math.random() * 0.14))),
    });
  }
  const burst = { radius, elite, fragments };
  const gfx = new Graphics();
  gfx.tint = color;
  if (elite) gfx.blendMode = 'add';
  redrawDeathBurst(gfx, burst, 0);
  return { gfx, burst };
}

/** Redraw a whole vanish into one Graphics: the center collapses into square
 * cells while its fragments move outward and shrink. */
function redrawDeathBurst(gfx: Graphics, burst: DeathBurst, k: number): void {
  gfx.clear();
  const coreK = Math.max(0, 1 - k * 1.7);
  if (coreK > 0) {
    const r = burst.radius * coreK;
    const cell = Math.max(1.5, r * 0.48);
    for (const [x, y] of [
      [0, 0],
      [-0.52, 0],
      [0.52, 0],
      [0, -0.52],
      [0, 0.52],
    ] as const) {
      gfx.rect(x * r - cell / 2, y * r - cell / 2, cell, cell);
    }
    gfx.fill({ color: 0xffffff, alpha: 0.9 });
    gfx.rect(-r * 0.85, -r * 0.85, r * 1.7, r * 1.7)
      .stroke({ width: burst.elite ? 3 : 1.5, color: 0xffffff, alpha: 0.65 });
    if (burst.elite) {
      gfx.rect(-r, -r, r * 2, r * 2).stroke({ width: 2.5, color: 0xffffff, alpha: 0.8 });
    }
  }

  const travelK = 1 - (1 - k) * (1 - k);
  for (const f of burst.fragments) {
    const size = Math.max(0.8, f.size * (1 - k * 0.72));
    const x = f.x + f.dx * travelK;
    const y = f.y + f.dy * travelK;
    gfx.rect(x - size / 2, y - size / 2, size, size);
  }
  gfx.fill({ color: 0xffffff, alpha: burst.elite ? 1 : 0.9 });
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

interface GemGfx extends Container {
  __tier: Gem['tier'];
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

/** A dropped level-up option on the ground: enough for the view to draw the
 *  coin (glyph in `color`) and its two text lines. Positions are world units;
 *  the shell owns these entities, the world simulation does not. */
export interface GroundPickView {
  x: number;
  y: number;
  role: Role;
  color: number;
  /** Instrument name, e.g. "Shaker". */
  name: string;
  /** Level line: "1" for a new pick, "2 → 3" for a tier-up. */
  level: string;
}

const PICK_NAME_STYLE = new TextStyle({
  fontFamily: 'system-ui, sans-serif',
  fontSize: 15,
  fontWeight: '700',
  fill: 0xffffff,
});
const PICK_LEVEL_STYLE = new TextStyle({
  fontFamily: 'system-ui, sans-serif',
  fontSize: 14,
  fontWeight: '600',
  fill: 0xdfe4ee,
});
const PICK_COIN_R = 27; // coin radius, world units
const PICK_ICON_S = 15; // glyph half-extent, world units

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
  private gemGfx = new Map<Gem, GemGfx>();
  // Level-up ground picks: shell-owned, so they ride a dedicated layer that is
  // re-topped each frame (entities are added to the stage as they spawn, which
  // would otherwise draw the horde over the reward).
  private groundLayer = new Container();
  private groundPickGfx: Container[] = [];
  private pops: Pop[] = [];
  private deathBurstCount = 0;
  private floaters: Floater[] = [];
  private live = new Set<object>();

  // Shared view-only feel systems (Feature 3). All decay off world.timeS.
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
    this.stage.addChild(this.groundLayer); // re-topped each frame while active
    this.stage.addChild(this.flashGfx); // re-topped each active frame
  }

  /** Route a screenshake in from outside the fx queue (e.g. Feature 1's
   *  player-hit shake) — the single shake system (D5). */
  pushShake(mag: number, dur: number): void {
    this.shakes.push({ start: this.world.timeS, mag, dur });
  }

  /** Level-up flourish: a signal-colored ring that expands and fades from
   *  (x,y). View-only and rides the pops list. */
  flourish(x: number, y: number): void {
    const g = new Graphics().circle(0, 0, 30).stroke({ width: 4, color: 0xffffff });
    g.tint = 0x59ffd1;
    g.position.set(x, y);
    g.scale.set(0.2);
    g.blendMode = 'add';
    this.stage.addChild(g);
    this.pops.push({ gfx: g, t: 0, dur: 0.7, grow: 9 });
  }

  /** Bigger level-up burst: a few layered signal-colored rings plus a soft
   *  screen flash, for the "you levelled" moment. View-only. */
  levelBurst(x: number, y: number): void {
    for (const grow of [7, 11, 15]) {
      const g = new Graphics().circle(0, 0, 26).stroke({ width: 5, color: 0xffffff });
      g.tint = 0x59ffd1;
      g.position.set(x, y);
      g.scale.set(0.15);
      g.blendMode = 'add';
      this.stage.addChild(g);
      this.pops.push({ gfx: g, t: 0, dur: 0.72, grow });
    }
    this.flashes.push({ start: this.world.timeS, dur: 0.5, color: 0x59ffd1, alpha: 0.2 });
  }

  /** Replace the on-ground level-up items (empty array clears them). The shell
   *  owns these entities and their positions; the world never sees them. */
  setGroundPicks(picks: GroundPickView[]): void {
    for (const c of this.groundPickGfx) c.destroy({ children: true });
    this.groundPickGfx.length = 0;
    for (const pk of picks) {
      const c = makeGroundPick(pk);
      this.groundLayer.addChild(c);
      this.groundPickGfx.push(c);
    }
  }

  /** Gentle idle pulse on the dropped items + keep their layer on top of the
   *  horde (entities append to the stage as they spawn). */
  private updateGroundPicks(): void {
    if (this.groundPickGfx.length === 0) return;
    const t = this.world.timeS;
    for (let i = 0; i < this.groundPickGfx.length; i++) {
      this.groundPickGfx[i].scale.set(1 + 0.05 * Math.sin(t * 4 + i * 2.1));
    }
    this.stage.setChildIndex(this.groundLayer, this.stage.children.length - 1);
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
    this.drawTrails();
    this.sync(this.world.zones, this.zoneGfx, makeZoneGfx, (z, gfx) => {
      gfx.alpha = Math.min(1, z.lifeS * 2);
    });
    const p = this.world.player;
    const cameraX = p.x + PLAYER_FOOT_OFFSET.x;
    const cameraY = p.y + PLAYER_FOOT_OFFSET.y;
    const cullW = this.world.worldW / 2 + 40;
    const cullH = this.world.worldH / 2 + 40;
    this.sync(this.world.gems, this.gemGfx, makeGemGfx, (g, gfx) => {
      // Once the 400-ground-gem cap is reached, one existing pickup becomes
      // the red overflow gem. Rebuild its tiny cached visual when that tier
      // mutation happens; position-only syncing would leave it blue forever.
      if (gfx.__tier !== g.tier) {
        const fresh = makeGemGfx(g);
        gfx.destroy({ children: true });
        this.gemGfx.set(g, fresh);
        this.stage.addChild(fresh);
        gfx = fresh;
      }
      const visible = Math.abs(g.x - cameraX) < cullW && Math.abs(g.y - cameraY) < cullH;
      gfx.renderable = visible;
      if (visible) gfx.position.set(g.x, g.y);
    });
    this.updatePops(dt);
    this.updateFloaters(dt);
    this.updateGroundPicks();
    this.drawGrid();
    this.drawFlash();

    // Screenshake decays off world.timeS and uses view-only random jitter.
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
      this.view.width / 2 - cameraX * zoom + sx,
      this.view.height / 2 - cameraY * zoom + sy,
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
    this.groundPickGfx.length = 0; // stage.destroy already freed the graphics
    this.pops.length = 0;
    this.deathBurstCount = 0;
    for (const f of this.floaters) f.txt.destroy();
    this.floaters.length = 0;
    this.trails.clear();
    this.shakes.length = 0;
    this.flashes.length = 0;
  }

  private syncEnemies(): void {
    // culling: event rows can push the 300-enemy periodic cap toward the 500
    // hard cap; off-screen units stay simulated but skip draw updates.
    const p = this.world.player;
    const cameraX = p.x + PLAYER_FOOT_OFFSET.x;
    const cameraY = p.y + PLAYER_FOOT_OFFSET.y;
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
      const visible = Math.abs(e.x - cameraX) < cullW && Math.abs(e.y - cameraY) < cullH;
      gfx.renderable = visible;
      if (!visible) continue;
      gfx.position.set(e.x, e.y);
      gfx.tint = e.flashT > 0 ? 0xffffff : e.color;
      if (e.kind === 'batSwarm' && (e.moveX !== 0 || e.moveY !== 0)) {
        gfx.rotation = Math.atan2(e.moveY, e.moveX);
      } else if (
        (e.kind === 'darter' || e.kind === 'charger') &&
        (e.dashX !== 0 || e.dashY !== 0)
      ) {
        gfx.rotation = Math.atan2(e.dashY, e.dashX);
      }
      // Shield break: a Graphics's shape is fixed at creation, so swap the
      // shared context when the ring should appear/disappear (bounded count).
      if (e.kind === 'shielded') {
        const sg = gfx as ShieldGfx;
        const want = e.shieldHp > 0;
        if (sg.__shield !== want) {
          gfx.context = enemyContext(e, want);
          sg.__shield = want;
        }
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
        // Kick's hit reads as a mini shockwave: a soft, borderless pulse that
        // bursts from the player out across the strip zone and fades fast. No
        // outline, no rails. Drawn beneath the player so it never paints over
        // the character.
        const { width, height } = whipDimensions(fx.area);
        const x0 = fx.side === 1 ? 0 : -width;
        const r = height / 2;
        const gfx = new Graphics();
        gfx.roundRect(x0, -height * 0.72, width, height * 1.44, r).fill({ color: 0xffffff, alpha: 0.12 });
        gfx.roundRect(x0, -height / 2, width, height, r).fill({ color: 0xffffff, alpha: 0.34 });
        gfx.tint = fx.color;
        gfx.blendMode = 'add';
        gfx.position.set(fx.x, fx.y);
        gfx.scale.set(0);
        this.stage.addChildAt(gfx, this.stage.getChildIndex(this.playerGfx));
        this.pops.push({ gfx, t: 0, dur: 0.18, grow: 0, holdHalf: true, expandHalf: true });
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
        const cameraX = p.x + PLAYER_FOOT_OFFSET.x;
        const cameraY = p.y + PLAYER_FOOT_OFFSET.y;
        if (Math.abs(fx.x - cameraX) > this.world.worldW / 2 + 40) break;
        if (Math.abs(fx.y - cameraY) > this.world.worldH / 2 + 40) break;
        const txt = new Text({ text: String(fx.amount), style: DMG_STYLE });
        txt.anchor.set(0.5);
        txt.tint = fx.color;
        const x = fx.x + (Math.random() * 2 - 1) * 6;
        txt.position.set(x, fx.y);
        this.stage.addChild(txt);
        this.floaters.push({ txt, x, y: fx.y, t: 0, dur: DMG_DUR, vy: DMG_RISE });
        break;
      }
      case 'death': {
        if (this.deathBurstCount >= DEATH_BURST_CAP) break;
        if (!fx.elite && this.deathBurstCount >= REGULAR_DEATH_BURST_CAP) break;
        // Deaths outside the camera do not need particles. Elites get a little
        // extra padding so their larger burst can begin just beyond an edge.
        const p = this.world.player;
        const cameraX = p.x + PLAYER_FOOT_OFFSET.x;
        const cameraY = p.y + PLAYER_FOOT_OFFSET.y;
        const pad = fx.elite ? fx.radius * 3 : fx.radius * 2;
        if (Math.abs(fx.x - cameraX) > this.world.worldW / 2 + pad) break;
        if (Math.abs(fx.y - cameraY) > this.world.worldH / 2 + pad) break;

        const { gfx, burst } = makeDeathBurst(fx.radius, fx.color, fx.elite);
        gfx.position.set(fx.x, fx.y);
        this.stage.addChild(gfx);
        this.pops.push({
          gfx,
          t: 0,
          dur: fx.elite ? 0.62 : 0.42,
          grow: 0,
          death: burst,
        });
        this.deathBurstCount++;
        break;
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
        if (p.death) this.deathBurstCount--;
        p.gfx.destroy();
        this.pops.splice(i, 1);
        continue;
      }
      if (p.death) {
        redrawDeathBurst(p.gfx, p.death, k);
        p.gfx.alpha = Math.pow(1 - k, 0.7);
      } else {
        p.gfx.alpha = p.holdHalf ? (k < 0.5 ? 1 : (1 - k) * 2) : 1 - k;
        if (p.expandHalf) p.gfx.scale.set(Math.min(1, k * 2));
        else if (p.grow > 0) p.gfx.scale.set(0.2 + (p.grow - 0.2) * k);
      }
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
      const cameraX = p.x + PLAYER_FOOT_OFFSET.x;
      const cameraY = p.y + PLAYER_FOOT_OFFSET.y;
      const w = this.world.worldW;
      const h = this.world.worldH;
      this.flashGfx.rect(cameraX - w / 2, cameraY - h / 2, w, h).fill(0xffffff);
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
    const left = this.world.player.x + PLAYER_FOOT_OFFSET.x - w / 2;
    const top = this.world.player.y + PLAYER_FOOT_OFFSET.y - h / 2;
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

/** A Graphics tagged with the last-rendered shield state, so syncEnemies can
 *  detect a shield break and swap the shared context. */
interface ShieldGfx extends Graphics {
  __shield?: boolean;
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

/** The shared GraphicsContext for an enemy's (kind, band, radius[, shield]).
 *  Shielded's context depends on shieldOn so the ring can be swapped away. */
function enemyContext(e: Enemy, shieldOn: boolean): GraphicsContext {
  const radius = e.radius;
  const shieldKey = e.kind === 'shielded' ? (shieldOn ? ':1' : ':0') : '';
  return cachedShape(`enemy:${e.kind}:${e.band}:${radius}${shieldKey}`, (g) => {
    switch (e.kind) {
      case 'bat':
        // Two soft angular wings around a narrow body: readable even in a
        // dense flock, without needing to animate individual wing nodes.
        g.poly([
          -radius * 0.12, -radius * 0.2,
          -radius * 1.35, -radius * 0.82,
          -radius * 0.9, radius * 0.08,
          -radius * 1.15, radius * 0.78,
          -radius * 0.12, radius * 0.35,
        ]).fill(0xffffff);
        g.poly([
          radius * 0.12, -radius * 0.2,
          radius * 1.35, -radius * 0.82,
          radius * 0.9, radius * 0.08,
          radius * 1.15, radius * 0.78,
          radius * 0.12, radius * 0.35,
        ]).fill(0xffffff);
        g.ellipse(0, radius * 0.08, radius * 0.28, radius * 0.72).fill(0xffffff);
        break;
      case 'redBat':
      case 'redBat2':
        // Jagged wings and pointed ears distinguish the tougher red bat by
        // silhouette as well as tint.
        g.poly([
          0, -radius * 0.1,
          -radius * 0.7, -radius * 0.95,
          -radius * 1.5, -radius * 0.45,
          -radius * 1.02, radius * 0.05,
          -radius * 1.42, radius * 0.72,
          -radius * 0.35, radius * 0.45,
          0, radius * 0.75,
          radius * 0.35, radius * 0.45,
          radius * 1.42, radius * 0.72,
          radius * 1.02, radius * 0.05,
          radius * 1.5, -radius * 0.45,
          radius * 0.7, -radius * 0.95,
        ]).fill(0xffffff);
        g.poly([
          -radius * 0.34, -radius * 0.52,
          -radius * 0.18, -radius * 1.05,
          0, -radius * 0.58,
          radius * 0.18, -radius * 1.05,
          radius * 0.34, -radius * 0.52,
        ]).fill(0xffffff);
        g.circle(-radius * 0.16, -radius * 0.35, radius * 0.08).fill(0x101014);
        g.circle(radius * 0.16, -radius * 0.35, radius * 0.08).fill(0x101014);
        if (e.kind === 'redBat2') {
          g.moveTo(-radius * 1.05, radius * 0.05)
            .lineTo(-radius * 0.55, radius * 0.2)
            .moveTo(radius * 1.05, radius * 0.05)
            .lineTo(radius * 0.55, radius * 0.2)
            .stroke({ width: 2, color: 0x101014, alpha: 0.8 });
        }
        break;
      case 'zombie':
        // Blocky leaning humanoid: square shoulders, uneven arms and legs.
        g.circle(0, -radius * 0.58, radius * 0.36).fill(0xffffff);
        g.roundRect(-radius * 0.48, -radius * 0.3, radius * 0.96, radius * 1.15, radius * 0.18)
          .fill(0xffffff);
        g.poly([
          -radius * 0.35, -radius * 0.15,
          -radius * 1.05, radius * 0.18,
          -radius * 0.92, radius * 0.42,
          -radius * 0.22, radius * 0.18,
        ]).fill(0xffffff);
        g.poly([
          radius * 0.35, -radius * 0.12,
          radius * 1.08, radius * 0.42,
          radius * 0.9, radius * 0.62,
          radius * 0.2, radius * 0.2,
        ]).fill(0xffffff);
        g.rect(-radius * 0.43, radius * 0.55, radius * 0.3, radius * 0.62).fill(0xffffff);
        g.rect(radius * 0.12, radius * 0.55, radius * 0.3, radius * 0.62).fill(0xffffff);
        break;
      case 'skeleton':
        // Hollow skull plus explicit ribs/limbs stays legible against the
        // zombie's solid body, even when both are near-white.
        g.circle(0, -radius * 0.62, radius * 0.38).stroke({ width: 2.5, color: 0xffffff });
        g.circle(-radius * 0.13, -radius * 0.66, radius * 0.07).fill(0xffffff);
        g.circle(radius * 0.13, -radius * 0.66, radius * 0.07).fill(0xffffff);
        g.moveTo(0, -radius * 0.25).lineTo(0, radius * 0.62);
        for (const y of [-0.12, 0.1, 0.32]) {
          g.moveTo(-radius * 0.38, radius * y).lineTo(radius * 0.38, radius * y);
        }
        g.moveTo(-radius * 0.12, -radius * 0.05).lineTo(-radius * 0.8, radius * 0.42);
        g.moveTo(radius * 0.12, -radius * 0.05).lineTo(radius * 0.8, radius * 0.42);
        g.moveTo(0, radius * 0.55).lineTo(-radius * 0.48, radius * 1.05);
        g.moveTo(0, radius * 0.55).lineTo(radius * 0.48, radius * 1.05);
        g.stroke({ width: 2.5, color: 0xffffff });
        break;
      case 'ghost':
        // Rounded head and a three-point floating tail, with empty eyes.
        g.circle(0, -radius * 0.18, radius * 0.78).fill(0xffffff);
        g.poly([
          -radius * 0.78, -radius * 0.1,
          -radius * 0.72, radius * 0.85,
          -radius * 0.32, radius * 0.55,
          0, radius * 0.94,
          radius * 0.32, radius * 0.55,
          radius * 0.72, radius * 0.85,
          radius * 0.78, -radius * 0.1,
        ]).fill(0xffffff);
        g.ellipse(-radius * 0.24, -radius * 0.28, radius * 0.1, radius * 0.18).fill(0x101014);
        g.ellipse(radius * 0.24, -radius * 0.28, radius * 0.1, radius * 0.18).fill(0x101014);
        break;
      case 'greenMudman':
        // A tall mound assembled from overlapping blobs, with a heavy base.
        g.circle(-radius * 0.32, -radius * 0.12, radius * 0.56).fill(0xffffff);
        g.circle(radius * 0.32, -radius * 0.22, radius * 0.62).fill(0xffffff);
        g.circle(0, -radius * 0.55, radius * 0.48).fill(0xffffff);
        g.ellipse(0, radius * 0.38, radius * 0.88, radius * 0.58).fill(0xffffff);
        g.circle(-radius * 0.18, -radius * 0.52, radius * 0.08).fill(0x101014);
        g.circle(radius * 0.18, -radius * 0.52, radius * 0.08).fill(0x101014);
        break;
      case 'grayMudman':
        // Squatter, angular mud mass; fracture lines separate it from green's
        // round stacked silhouette.
        g.poly([
          -radius * 0.95, radius * 0.62,
          -radius * 0.82, -radius * 0.2,
          -radius * 0.42, -radius * 0.74,
          0, -radius * 0.52,
          radius * 0.38, -radius * 0.82,
          radius * 0.88, -radius * 0.12,
          radius, radius * 0.62,
        ]).fill(0xffffff);
        g.moveTo(-radius * 0.45, -radius * 0.18)
          .lineTo(-radius * 0.08, radius * 0.1)
          .lineTo(-radius * 0.28, radius * 0.5);
        g.moveTo(radius * 0.48, -radius * 0.34)
          .lineTo(radius * 0.12, radius * 0.02)
          .lineTo(radius * 0.35, radius * 0.4);
        g.stroke({ width: 2, color: 0x101014, alpha: 0.75 });
        break;
      case 'flower': {
        // Six petals around a dark seed: unmistakable in the enclosing wall.
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          g.circle(Math.cos(a) * radius * 0.57, Math.sin(a) * radius * 0.57, radius * 0.43)
            .fill(0xffffff);
        }
        g.circle(0, 0, radius * 0.4).fill(0x101014);
        g.circle(0, 0, radius * 0.17).fill(0xffffff);
        break;
      }
      case 'glowingBat':
        // Elite bat: broad crown-like wings inside a bright objective ring.
        g.circle(0, 0, radius * 1.08).stroke({ width: 3.5, color: 0xffffff, alpha: 0.75 });
        g.poly([
          0, -radius * 0.25,
          -radius * 0.5, -radius * 0.82,
          -radius * 1.25, -radius * 0.65,
          -radius * 0.88, 0,
          -radius * 1.18, radius * 0.68,
          -radius * 0.28, radius * 0.42,
          0, radius * 0.82,
          radius * 0.28, radius * 0.42,
          radius * 1.18, radius * 0.68,
          radius * 0.88, 0,
          radius * 1.25, -radius * 0.65,
          radius * 0.5, -radius * 0.82,
        ]).fill(0xffffff);
        g.circle(0, 0, radius * 0.25).fill(0x101014);
        g.circle(0, 0, radius * 0.1).fill(0xffffff);
        break;
      case 'mantis':
        // Tall segmented body and two oversized hooked forearms communicate
        // boss danger without relying on color alone.
        g.poly([
          0, -radius,
          -radius * 0.38, -radius * 0.58,
          -radius * 0.2, -radius * 0.26,
          radius * 0.2, -radius * 0.26,
          radius * 0.38, -radius * 0.58,
        ]).fill(0xffffff);
        g.ellipse(0, radius * 0.22, radius * 0.24, radius * 0.72).fill(0xffffff);
        g.poly([
          -radius * 0.15, -radius * 0.3,
          -radius * 1.1, -radius * 0.72,
          -radius * 0.72, radius * 0.05,
          -radius * 1.22, radius * 0.52,
          -radius * 0.52, radius * 0.18,
        ]).fill(0xffffff);
        g.poly([
          radius * 0.15, -radius * 0.3,
          radius * 1.1, -radius * 0.72,
          radius * 0.72, radius * 0.05,
          radius * 1.22, radius * 0.52,
          radius * 0.52, radius * 0.18,
        ]).fill(0xffffff);
        g.moveTo(-radius * 0.12, radius * 0.4).lineTo(-radius * 0.75, radius * 0.95);
        g.moveTo(radius * 0.12, radius * 0.4).lineTo(radius * 0.75, radius * 0.95);
        g.stroke({ width: 3, color: 0xffffff });
        g.circle(0, radius * 0.08, radius * 0.12).fill(0x101014);
        break;
      case 'batSwarm':
        // A flattened arrow-bat with rear speed marks; the view rotates it to
        // its fixed sweep direction in syncEnemies.
        g.poly([
          radius * 1.45, 0,
          radius * 0.2, -radius * 0.38,
          -radius * 0.4, -radius * 0.88,
          -radius * 0.2, 0,
          -radius * 0.4, radius * 0.88,
          radius * 0.2, radius * 0.38,
        ]).fill(0xffffff);
        for (const y of [-0.42, 0, 0.42]) {
          g.moveTo(-radius * 0.42, radius * y).lineTo(-radius * 1.25, radius * y);
        }
        g.stroke({ width: 1.5, color: 0xffffff, alpha: 0.65 });
        break;
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
      case 'circler':
        // hollow ring with a center dot
        g.circle(0, 0, radius).stroke({ width: 3, color: 0xffffff });
        g.circle(0, 0, radius * 0.4).fill(0xffffff);
        break;
      case 'shielded':
        // octagon body; the shield ring shows only while shieldHp > 0
        g.poly(regularPoly(8, radius, Math.PI / 8)).fill(0xffffff);
        if (shieldOn) g.circle(0, 0, radius * 1.35).stroke({ width: 3, color: 0xffffff });
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
  const shieldOn = e.shieldHp > 0;
  const gfx = new Graphics(enemyContext(e, shieldOn)) as ShieldGfx;
  gfx.tint = e.color;
  if (e.kind === 'ghost') gfx.alpha = 0.78;
  if (e.kind === 'shielded') gfx.__shield = shieldOn;
  // Enemies stay flat cachedShape Graphics (no child nodes) to keep GPU
  // batching intact across the capped horde and to preserve the per-frame
  // hit-flash tint. Elites read as elite through size, the hottest band color,
  // and the dark core — no glow child (which Pixi v8 disallows on a Graphics).
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
      case 'arp': // orbiter: a bead with a ring
        g.circle(0, 0, pr.radius).stroke({ width: 3, color: 0xffffff });
        g.circle(0, 0, pr.radius * 0.45).fill(0xffffff);
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
  // Zones use a distinct floor mark so their damaging area reads in a crowd.
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
    default: {
      gfx.circle(0, 0, r).fill({ color: 0xffffff, alpha: 0.12 });
      gfx.circle(0, 0, r).stroke({ width: 2, color: 0xffffff, alpha: 0.5 });
    }
  }
  gfx.tint = z.color;
  gfx.position.set(z.x, z.y);
  return gfx;
}

function makeGroundPick(pk: GroundPickView): Container {
  const c = new Container();
  c.position.set(pk.x, pk.y);
  const glow = makeGlow(Math.round(PICK_COIN_R * 1.5), pk.color);
  glow.alpha = 0.4;
  // Cache the coin geometry per color (like makeGemGfx): a shared, non-owned
  // context so destroy({children:true}) frees the container without leaking an
  // owned context and without over-freeing the shared glow/glyph contexts.
  const coin = new Graphics(
    cachedShape(`coin:${pk.color}`, (cc) => {
      cc.circle(0, 0, PICK_COIN_R).fill(0x0a0b0f);
      cc.circle(0, 0, PICK_COIN_R).stroke({ width: 3, color: pk.color, alpha: 0.95 });
    }),
  );
  const icon = new Graphics(
    cachedShape(`wicon:${pk.role}`, (cc) => drawWeaponIcon(cc, pk.role, PICK_ICON_S)),
  );
  icon.tint = pk.color;
  const name = new Text({ text: pk.name, style: PICK_NAME_STYLE });
  name.anchor.set(0.5);
  name.position.set(0, PICK_COIN_R + 15);
  name.tint = pk.color;
  const level = new Text({ text: pk.level, style: PICK_LEVEL_STYLE });
  level.anchor.set(0.5);
  level.position.set(0, PICK_COIN_R + 34);
  c.addChild(glow, coin, icon, name, level);
  return c;
}

function makeGemGfx(g: Gem): GemGfx {
  // VS-value tiers at a glance: blue is the small common drop, green is the
  // mid-value gem, red is the large prize. Geometry remains the game's clean
  // vector diamond and each tier shares one cached context.
  const style =
    g.tier === 'red'
      ? { size: 7, color: 0xff596f, glow: 11, glowAlpha: 0.45 }
      : g.tier === 'green'
        ? { size: 5.5, color: 0x69e786, glow: 8.5, glowAlpha: 0.38 }
        : { size: 4.25, color: 0x62a8ff, glow: 6.5, glowAlpha: 0.32 };
  const ctx = cachedShape(`gem:${g.tier}`, (c) => {
    const s = style.size;
    c.poly([0, -s, s, 0, 0, s, -s, 0]).fill(0xffffff);
    c.poly([0, -s * 0.34, s * 0.34, 0, 0, s * 0.34, -s * 0.34, 0]).fill(0x0a0b0f);
    if (g.tier === 'red') {
      c.poly([0, -s * 1.25, s * 1.25, 0, 0, s * 1.25, -s * 1.25, 0])
        .stroke({ width: 1.5, color: 0xffffff, alpha: 0.55 });
    }
  });
  const body = new Graphics(ctx);
  body.tint = style.color;
  const glow = makeGlow(style.glow, style.color);
  glow.alpha = style.glowAlpha;
  const c = new Container() as GemGfx;
  c.__tier = g.tier;
  c.addChild(glow, body);
  c.position.set(g.x, g.y);
  return c;
}
