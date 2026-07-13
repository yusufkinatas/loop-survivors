// Application router. Player game and Dev Campus are disposable top-level
// surfaces; rooms inside the campus switch without hard reloads.

import { buildKits } from './audio/kits';
import { MusicEngine } from './audio/engine';
import * as charts from './audio/chartstore';
import { SKELETON } from './audio/scale';
import { bootGame } from './game/game';
import { compatibilityRoom } from './dev/content';
import { mountDevCampus } from './dev/campus';
import type { DisposableSession } from './lifecycle';
import './style.css';

type Surface = 'game' | 'dev';

function surfaceFor(hash: string): Surface {
  return hash.startsWith('#dev') || compatibilityRoom(hash) ? 'dev' : 'game';
}

async function boot(): Promise<void> {
  const root = document.getElementById('app')!;
  root.textContent = 'rendering kits…';

  // Immutable decoded/rendered buffers are shared. Every MusicEngine, room,
  // ticker, listener, and world is mutable and belongs to one session.
  const kits = await buildKits(SKELETON.rootHz);
  const ctx = new AudioContext({ latencyHint: 'interactive' });
  const loop = { kits, charts } as Record<string, unknown>;
  (window as unknown as { loop: Record<string, unknown> }).loop = loop;

  let active: DisposableSession | null = null;
  let activeSurface: Surface | null = null;
  let activeEngine: MusicEngine | null = null;
  let generation = 0;
  let routeQueue = Promise.resolve();

  const onPointerDown = (): void => {
    if (activeEngine) activeEngine.resumeContextIfAllowed();
    else if (ctx.state !== 'running') void ctx.resume();
  };
  document.addEventListener('pointerdown', onPointerDown);

  async function route(): Promise<void> {
    const nextSurface = surfaceFor(location.hash);
    if (nextSurface === activeSurface) return;
    const myGeneration = ++generation;
    if (active) await active.dispose();
    active = null;
    activeEngine = null;
    activeSurface = null;
    if (myGeneration !== generation) return;

    root.replaceChildren();
    if (nextSurface === 'dev') {
      active = await mountDevCampus(root, { ctx, kits });
    } else {
      const engine = new MusicEngine(ctx, kits);
      activeEngine = engine;
      loop.engine = engine;
      const game = await bootGame(root, engine, kits);
      active = {
        async dispose(): Promise<void> {
          await game.dispose();
          engine.dispose();
          if (loop.engine === engine) delete loop.engine;
        },
      };
    }
    activeSurface = nextSurface;
  }

  const queueRoute = (): void => {
    routeQueue = routeQueue.then(route).catch((error) => {
      root.replaceChildren();
      const pre = document.createElement('pre');
      pre.className = 'boot-error';
      pre.textContent = error instanceof Error ? error.stack ?? error.message : String(error);
      root.appendChild(pre);
      console.error(error);
    });
  };

  window.addEventListener('hashchange', queueRoute);
  queueRoute();
}

void boot();
