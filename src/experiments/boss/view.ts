// Sprite renderer for the fixed boss arena. Simulation remains entirely in
// world.ts; this view only maps its state onto the shared pixel-art atlases.

import { Container, Sprite, TilingSprite } from 'pixi.js';
import type { Texture } from 'pixi.js';
import {
  arenaFloorTexture,
  effectPixelTexture,
  enemyPixelFrames,
  environmentPixelTexture,
  playerPixelFrames,
  preloadPixelArt,
  weaponPixelTexture,
  type PixelEnvironmentId,
} from '../../game/pixel-art';
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

interface ProjectileTextures {
  cyan: Texture;
  magenta: Texture;
  warm: Texture;
}

const DIAG = Math.hypot(ARENA.w, ARENA.h);

export class BossView {
  readonly stage: Container;
  private world: BossWorld;
  private palette: BossPalette;

  private box: Container;
  private floorLayer = new Container();
  private environmentLayer = new Container();
  private hazardLayer = new Container();
  private bulletLayer = new Container();
  private fxLayer = new Container();
  private bossLayer = new Container();
  private playerLayer = new Container();

  private hazardSprites: Sprite[] = [];
  private bulletSprites: Sprite[] = [];
  private fxSprites: Sprite[] = [];
  private bossAura?: Sprite;
  private bossSprite?: Sprite;
  private playerDash?: Sprite;
  private playerSprite?: Sprite;
  private playerFrames?: readonly [Texture, Texture];
  private bossFrames?: readonly [Texture, Texture];
  private projectiles?: ProjectileTextures;
  private impactCyan?: Texture;
  private impactGold?: Texture;
  private explosion?: Texture;
  private death?: Texture;
  private xpCollect?: Texture;
  private kickNormal?: Texture;
  private kickEvolved?: Texture;
  private runeDais?: Texture;
  private artReady = false;
  private destroyed = false;

  private pops: Pop[] = [];
  private lastFit = 0;
  private shakes: { start: number; mag: number; dur: number }[] = [];

  constructor(world: BossWorld, palette: BossPalette) {
    this.world = world;
    this.palette = palette;
    this.stage = new Container();
    this.box = new Container();
    this.stage.addChild(this.box);
    this.box.addChild(
      this.floorLayer,
      this.environmentLayer,
      this.hazardLayer,
      this.bulletLayer,
      this.fxLayer,
      this.bossLayer,
      this.playerLayer,
    );

    // The boss route can be opened directly before the main arena has loaded
    // art. Keep the constructor/API synchronous and install sprites as soon as
    // the shared preload completes.
    void preloadPixelArt()
      .then(() => {
        if (!this.destroyed) this.installArt();
      })
      .catch((error: unknown) => {
        // A failed network/decode should not take down the simulation or leave
        // an unhandled rejection; the boss HUD still remains usable.
        console.error('Boss pixel-art preload failed', error);
      });
  }

  destroy(): void {
    this.destroyed = true;
    this.stage.destroy({ children: true });
  }

  private installArt(): void {
    const floor = new TilingSprite({
      texture: arenaFloorTexture(),
      width: ARENA.w,
      height: ARENA.h,
      anchor: 0.5,
      roundPixels: true,
    });
    floor.alpha = 0.82;
    this.floorLayer.addChild(floor);
    this.installEnvironment();

    this.playerFrames = playerPixelFrames();
    const bossKind = this.palette.boss === 0xd14b8f
      ? 'mantis'
      : this.palette.boss === 0x2ad4ff
        ? 'glowingBat'
        : 'tank';
    this.bossFrames = enemyPixelFrames(bossKind);
    this.projectiles = {
      cyan: weaponPixelTexture('arp', true),
      magenta: weaponPixelTexture('chord', true),
      warm: weaponPixelTexture('bass', true),
    };
    this.impactCyan = effectPixelTexture('impact-cyan');
    this.impactGold = effectPixelTexture('impact-gold');
    this.explosion = effectPixelTexture('explosion');
    this.death = effectPixelTexture('death');
    this.xpCollect = effectPixelTexture('xp-collect');
    this.kickNormal = weaponPixelTexture('kick');
    this.kickEvolved = weaponPixelTexture('kick', true);
    this.runeDais = environmentPixelTexture('rune-dais');

    this.bossAura = this.newSprite(this.death, this.bossLayer);
    this.bossSprite = this.newSprite(this.bossFrames[0], this.bossLayer);
    this.playerDash = this.newSprite(this.xpCollect, this.playerLayer);
    this.playerSprite = this.newSprite(this.playerFrames[0], this.playerLayer);
    this.artReady = true;
  }

  private installEnvironment(): void {
    const hw = ARENA.w / 2;
    const hh = ARENA.h / 2;
    const props: ReadonlyArray<readonly [PixelEnvironmentId, number, number, number]> = [
      ['rune-pillar', -hw + 52, -hh + 58, 96],
      ['broken-pillar', hw - 52, -hh + 58, 96],
      ['hooded-statue', -hw + 54, hh - 65, 94],
      ['knight-statue', hw - 54, hh - 65, 96],
      ['cyan-brazier', -hw + 155, -hh + 45, 72],
      ['gold-brazier', hw - 155, -hh + 45, 72],
      ['cyan-crystals', -hw + 150, hh - 42, 78],
      ['gravestone', hw - 150, hh - 42, 74],
      ['rubble', -hw + 270, -hh + 30, 68],
      ['bones', hw - 270, -hh + 30, 66],
      ['thorn-vines', -hw + 280, hh - 25, 74],
      ['mushrooms', hw - 280, hh - 25, 64],
    ];
    for (const [id, x, y, size] of props) {
      const sprite = this.newSprite(environmentPixelTexture(id), this.environmentLayer);
      this.place(sprite, sprite.texture, x, y, size, size, 0.76);
    }
  }

  private newSprite(texture: Texture, layer: Container): Sprite {
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5);
    sprite.roundPixels = true;
    layer.addChild(sprite);
    return sprite;
  }

  private pooledSprite(pool: Sprite[], layer: Container, index: number, texture: Texture): Sprite {
    let sprite = pool[index];
    if (!sprite) {
      sprite = this.newSprite(texture, layer);
      pool.push(sprite);
    }
    sprite.visible = true;
    return sprite;
  }

  private hidePoolFrom(pool: Sprite[], used: number): void {
    for (let i = used; i < pool.length; i++) pool[i].visible = false;
  }

  private place(
    sprite: Sprite,
    texture: Texture,
    x: number,
    y: number,
    width: number,
    height: number,
    alpha = 1,
    tint = 0xffffff,
    rotation = 0,
  ): void {
    sprite.texture = texture;
    sprite.position.set(Math.round(x), Math.round(y));
    sprite.width = Math.max(1, Math.round(width));
    sprite.height = Math.max(1, Math.round(height));
    sprite.alpha = alpha;
    sprite.tint = tint;
    sprite.rotation = rotation;
    sprite.visible = true;
  }

  private fit(viewW: number, viewH: number): void {
    const scale = Math.min(viewW / ARENA.w, viewH / ARENA.h) * 0.96;
    if (scale !== this.lastFit) {
      this.box.scale.set(scale);
      this.lastFit = scale;
    }
  }

  update(dt: number, viewW: number, viewH: number): void {
    this.fit(viewW, viewH);
    // Hit shake: nudge the whole arena box a few view pixels, decaying over
    // each shake's life. Frozen results screens drop shake immediately.
    if (this.world.frozen) {
      this.shakes.length = 0;
      this.box.position.set(viewW / 2, viewH / 2);
    } else {
      const [sx, sy] = this.shakeOffset();
      this.box.position.set(viewW / 2 + sx, viewH / 2 + sy);
    }
    if (!this.artReady) return;
    this.drawHazards();
    this.drawBullets();
    this.drawBoss();
    this.drawPlayer();
    this.drawFx(dt);
  }

  /** Kick a screenshake (mag view px, over durS seconds). Same contract as
   * RunView.pushShake so shared damage feedback can drive either arena. */
  pushShake(mag: number, durS: number): void {
    this.shakes.push({ start: this.world.timeS, mag, dur: durS });
  }

  private shakeOffset(): [number, number] {
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
    if (!amp) return [0, 0];
    return [(Math.random() * 2 - 1) * amp, (Math.random() * 2 - 1) * amp];
  }

  private drawHazards(): void {
    const impact = this.impactGold!;
    let used = 0;
    const add = (
      texture: Texture,
      x: number,
      y: number,
      size: number,
      alpha: number,
      tint: number,
      rotation = 0,
    ): void => {
      const sprite = this.pooledSprite(this.hazardSprites, this.hazardLayer, used++, texture);
      this.place(sprite, texture, x, y, size, size, alpha, tint, rotation);
    };

    for (const shock of this.world.shocks) {
      const live = shock.age >= shock.warnT;
      const radius = live ? shock.r0 + (shock.age - shock.warnT) * shock.speed : shock.r0;
      if (!live) {
        const pulse = 1 + 0.12 * Math.sin(this.world.timeS * 18);
        add(this.runeDais!, shock.x, shock.y, (shock.r0 + 14) * 2 * pulse, 0.62, shock.color);
        continue;
      }
      const fade = Math.max(0.15, 1 - radius / shock.rMax);
      const count = Math.min(96, Math.max(12, Math.ceil(Math.PI * 2 * radius / 36)));
      const size = Math.max(14, Math.min(34, shock.thickness * 0.82));
      for (let i = 0; i < count; i++) {
        const angle = i / count * Math.PI * 2;
        add(impact, shock.x + Math.cos(angle) * radius, shock.y + Math.sin(angle) * radius,
          size, 0.72 * fade, shock.color, angle);
      }
    }

    for (const zone of this.world.zones) {
      const live = zone.age >= zone.warnT;
      const progress = live ? 1 : zone.age / zone.warnT;
      if (live) add(this.death!, zone.x, zone.y, zone.radius * 2, 0.62, zone.color);
      const count = Math.min(48, Math.max(14, Math.ceil(Math.PI * 2 * zone.radius / 32)));
      for (let i = 0; i < count; i++) {
        const angle = i / count * Math.PI * 2;
        add(live ? impact : this.impactCyan!,
          zone.x + Math.cos(angle) * zone.radius,
          zone.y + Math.sin(angle) * zone.radius,
          live ? 22 : 14,
          live ? 0.9 : 0.32 + 0.5 * progress,
          live ? 0xffffff : zone.color,
          angle);
      }
    }

    for (const beam of this.world.beams) {
      const live = beam.age >= beam.warnT;
      const alpha = live ? 0.9 : 0.3 + 0.35 * (beam.age / beam.warnT);
      const width = live ? beam.halfWidth * 2 : 8;
      let x1: number;
      let y1: number;
      let x2: number;
      let y2: number;
      if (beam.type === 'vlane') {
        x1 = x2 = beam.ox;
        y1 = -ARENA.h / 2;
        y2 = ARENA.h / 2;
      } else if (beam.type === 'hlane') {
        y1 = y2 = beam.oy;
        x1 = -ARENA.w / 2;
        x2 = ARENA.w / 2;
      } else {
        const dx = Math.cos(beam.angle);
        const dy = Math.sin(beam.angle);
        x1 = beam.ox - dx * DIAG;
        y1 = beam.oy - dy * DIAG;
        x2 = beam.ox + dx * DIAG;
        y2 = beam.oy + dy * DIAG;
      }
      const length = Math.hypot(x2 - x1, y2 - y1);
      const spacing = live ? Math.max(18, width * 0.62) : 32;
      const count = Math.max(2, Math.ceil(length / spacing));
      const angle = Math.atan2(y2 - y1, x2 - x1);
      for (let i = 0; i <= count; i++) {
        const t = i / count;
        add(impact, x1 + (x2 - x1) * t, y1 + (y2 - y1) * t,
          live ? Math.max(20, width) : 12, alpha, beam.color, angle);
      }
    }

    for (const arc of this.world.arcs) {
      const live = arc.age >= arc.warnT;
      const angleSteps = 11;
      const layers = live ? 3 : 1;
      for (let layer = 1; layer <= layers; layer++) {
        const radius = arc.reach * (live ? layer / layers : 1);
        for (let i = 0; i < angleSteps; i++) {
          const angle = arc.angle - arc.half + i / (angleSteps - 1) * arc.half * 2;
          add(live ? this.kickEvolved! : this.kickNormal!,
            arc.cx + Math.cos(angle) * radius,
            arc.cy + Math.sin(angle) * radius,
            live ? 30 : 18,
            live ? 0.78 : 0.38 + 0.42 * (arc.age / arc.warnT),
            arc.color,
            angle);
        }
      }
    }
    this.hidePoolFrom(this.hazardSprites, used);
  }

  private projectileTexture(color: number): Texture {
    const red = (color >>> 16) & 0xff;
    const green = (color >>> 8) & 0xff;
    const blue = color & 0xff;
    if (blue > red * 1.12 && green > red * 0.75) return this.projectiles!.cyan;
    if (blue > green * 1.18 || (red > 150 && blue > 120)) return this.projectiles!.magenta;
    return this.projectiles!.warm;
  }

  private drawBullets(): void {
    let used = 0;
    for (const bullet of this.world.bullets) {
      const texture = this.projectileTexture(bullet.color);
      const sprite = this.pooledSprite(this.bulletSprites, this.bulletLayer, used++, texture);
      const size = Math.max(16, Math.round((bullet.radius * 2 + 8) / 2) * 2);
      this.place(sprite, texture, bullet.x, bullet.y, size, size, 0.96, 0xffffff,
        Math.atan2(bullet.vy, bullet.vx) + Math.PI / 4);
    }
    this.hidePoolFrom(this.bulletSprites, used);
  }

  private drawBoss(): void {
    const boss = this.world.boss;
    const frame = this.bossFrames![Math.floor(this.world.timeS * 5) % 2];
    const pulse = 1 + 0.14 * boss.pulse;
    const bodySize = 96 * pulse;
    this.place(this.bossAura!, this.explosion!, boss.x, boss.y,
      boss.radius * 3.2 + boss.pulse * 42,
      boss.radius * 3.2 + boss.pulse * 42,
      0.18 + boss.pulse * 0.28,
      this.palette.boss);
    this.place(this.bossSprite!, frame, boss.x, boss.y, bodySize, bodySize, 1);
  }

  private drawPlayer(): void {
    const player = this.world.player;
    if (player.dashT > 0) {
      this.place(this.playerDash!, this.xpCollect!, player.x, player.y, 62, 62, 0.72, this.palette.accent);
    } else {
      this.playerDash!.visible = false;
    }
    const frame = this.playerFrames![Math.floor(this.world.timeS * 7) % 2];
    this.place(this.playerSprite!, frame, player.x, player.y, 48, 48, player.iframesT > 0 ? 0.45 : 1);
  }

  private drawFx(dt: number): void {
    for (const fx of this.world.fx) {
      this.pops.push({ x: fx.x, y: fx.y, color: fx.color, t: 0, dur: fx.type === 'slam' ? 0.3 : 0.22, kind: fx.type });
    }
    this.world.fx.length = 0;
    let used = 0;
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const pop = this.pops[i];
      pop.t += dt;
      const progress = pop.t / pop.dur;
      if (progress >= 1) {
        this.pops.splice(i, 1);
        continue;
      }
      const texture = pop.kind === 'slam' ? this.explosion! : this.impactGold!;
      const sprite = this.pooledSprite(this.fxSprites, this.fxLayer, used++, texture);
      const size = pop.kind === 'slam' ? 44 + progress * 176 : 14 + progress * 34;
      this.place(sprite, texture, pop.x, pop.y, size, size, 0.82 * (1 - progress), pop.color);
    }
    this.hidePoolFrom(this.fxSprites, used);
  }
}
