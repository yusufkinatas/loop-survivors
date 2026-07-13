// App entry. Player play remains the default; every developer surface is
// discoverable through one disposable, deep-linkable #dev campus.

import { buildKits } from './audio/kits';
import { MusicEngine } from './audio/engine';
import * as charts from './audio/chartstore';
import { SKELETON } from './audio/scale';
import { mountRehearsalRoom } from './rehearsal/room';
import { mountTrackLab } from './tracklab/lab';
import { mountBossFight } from './boss/page';
import { bootGame } from './game/game';
import { mountDevCampus } from './dev/campus';
import { roomByIssue } from './dev/registry';
import { roomPath } from './dev/types';
import './style.css';

declare global {
  interface Window {
    loop: Record<string, unknown>;
  }
}

async function boot(): Promise<void> {
  const root = document.getElementById('app')!;
  root.textContent = 'rendering kits…';
  const kits = await buildKits(SKELETON.rootHz);
  // The AudioContext and decoded kit buffers are app-lifetime immutable
  // resources. Every Campus room creates and disposes its own MusicEngine.
  const ctx = new AudioContext({ latencyHint: 'interactive' });
  window.loop = { kits, charts };

  const legacy = new URLSearchParams(location.search).get('legacy');
  if (!legacy) {
    const redirectIssue =
      location.hash === '#rehearsal'
        ? 39
        : location.hash === '#tracklab'
          ? 69
          : location.hash === '#boss'
            ? 52
            : null;
    if (redirectIssue !== null) {
      const room = roomByIssue(redirectIssue);
      if (room) history.replaceState(null, '', roomPath(room));
    }
  }

  // A generic user gesture recovers mobile audio. Intentional pauses are
  // engine-owned; campus engines do not suspend the shared context to pause a
  // simulation, so this cannot accidentally resume a disposed room.
  const resumeAudio = () => {
    if (ctx.state !== 'running') void ctx.resume();
  };
  document.addEventListener('pointerdown', resumeAudio);

  root.textContent = '';
  if (legacy === 'tracklab') {
    mountTrackLab(root, ctx);
  } else if (legacy === 'boss') {
    await mountBossFight(root, ctx);
  } else if (legacy === 'rehearsal') {
    const engine = new MusicEngine(ctx, kits);
    window.loop.engine = engine;
    mountRehearsalRoom(root, engine);
  } else if (location.hash.startsWith('#dev')) {
    const campus = await mountDevCampus(root, ctx, kits);
    window.loop.devCampus = campus;
  } else {
    const engine = new MusicEngine(ctx, kits);
    window.loop.engine = engine;
    await bootGame(root, engine, kits);
  }

  const startedInCampus = location.hash.startsWith('#dev');
  window.addEventListener('hashchange', () => {
    // Campus-to-campus navigation is handled in place after awaited disposal.
    // Crossing the player/legacy boundary still reloads because those older
    // surfaces do not yet share the Campus host lifecycle.
    if (startedInCampus && location.hash.startsWith('#dev')) return;
    location.reload();
  });
}

void boot();
