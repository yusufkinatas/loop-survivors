// THE LOAD-IN's capture rig (#269). Paste into the browser console with the game
// running, then: await __captureLoadIn(LOADIN_PLAN)
//
// Start the sink first so takes land in the repo rather than Downloads:
//   node docs/baseline/receiver.mjs --out docs/loadin
//
// SAME TAP, SAME RECORDER, SAME 16-BAR TAKE as docs/baseline/capture-rig.js —
// engine.analyser, post-limiter, immediately before the speakers — so a number
// from this set and a number from docs/baseline/ or docs/palette-control/ are
// the same measurement.
//
// WHAT IS DIFFERENT, and it is the whole point of the set. The baseline rig sets
// a BUILD and records. This one sets a build AND A STAGE PLOT: where each piece
// of gear stands, and what is on the player's back. Points 07-11 hold the build
// completely still — five maxed weapons, every time — and change only the
// geometry, which is the exact opposite of docs/baseline/, where the build
// changed by a factor of 13.5 and the loudness moved 2.8 dB.
//
// IT NEEDS A RUN, NOT THE SANDBOX. The sandbox is the base's arrangement-only
// surface and stays that way (a take from it is still directly comparable to
// docs/baseline/, which is why the Sandbox link is untouched on this branch).
// The stage plot only exists inside a run, so this rig starts one, makes the
// player untouchable, and clears the field before every take — so what is
// recorded is still the arrangement alone, with no combat on top of it.
//
// DO NOT edit anything under src/ while this is running. Vite's hot reload
// replaces the page and takes the rig with it.

window.__captureLoadIn = (() => {
  const g = window.loop.game;
  const e = window.loop.engine;
  const ctx = e.ctx;

  const dest = ctx.createMediaStreamDestination();
  e.analyser.connect(dest);

  const secPerBar = () => (4 * 60) / e.clock.bpm;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const stage = (level) => Math.max(1, Math.min(4, Math.ceil(level / 2)));

  // Chrome does not run requestAnimationFrame in a hidden tab, so the shell's
  // own per-frame voice sync cannot be relied on. The rig steps the world
  // directly and pushes the stage plot's numbers to the engine itself, which
  // makes a take identical whether the tab is in front or not.
  const settle = (frames = 12) => {
    const w = g.world;
    for (let i = 0; i < frames; i++) w.update(1 / 60);
    for (const role of w.tiers.keys()) {
      e.setVoiceEnabled(role, w.plot.audible(role));
      e.setVoiceRigGain(role, w.plot.outputOf(role));
      e.setVoicePan(role, w.plot.panOf(role));
    }
  };

  /** Apply one plan point: the build, where every piece stands, and what is
   *  carried. Positions are in world units relative to the player, who is put
   *  back at the venue's centre for every take so two takes are never framed
   *  differently. */
  const setPlot = (point) => {
    const w = g.world;
    for (const role of [...w.tiers.keys()]) w.removeWeapon(role);
    for (const role of e.voices.keys()) e.setVoiceEnabled(role, false);
    w.player.x = 0;
    w.player.y = 0;
    w.enemies.length = 0;
    for (const [role, level, x, y] of point.gear) {
      w.addWeapon(role, level);
      e.setVoiceTier(role, stage(level));
      w.plot.placeAt(role, x, y);
    }
    settle(4);
    for (const role of point.carried ?? []) {
      const rig = w.plot.rigFor(role);
      w.player.x = rig.x;
      w.player.y = rig.y;
      settle(2);
      w.plot.grabNearest();
    }
    w.player.x = 0;
    w.player.y = 0;
    settle(12);
  };

  const atPhrase = () =>
    new Promise((res) => e.atNextPhrase((t) => res(t))).then(async (t) => {
      const wait = (t - ctx.currentTime) * 1000;
      if (wait > 0) await sleep(wait);
      return t;
    });

  async function one(point, bars) {
    await atPhrase();
    setPlot(point);
    await sleep(secPerBar() * 4 * 1000); // play in for a full phrase
    // The field refills while the phrase plays; clear it again so nothing but
    // the arrangement is in the take.
    g.world.enemies.length = 0;
    await atPhrase();
    const rec = new MediaRecorder(dest.stream, {
      mimeType: 'audio/webm;codecs=opus',
      audioBitsPerSecond: 128000,
    });
    const chunks = [];
    rec.ondataavailable = (ev) => ev.data.size && chunks.push(ev.data);
    const stopped = new Promise((r) => (rec.onstop = r));
    rec.start();
    const until = ctx.currentTime + secPerBar() * bars;
    // Hold the field clear and the plot settled for the whole take.
    while (ctx.currentTime < until) {
      g.world.enemies.length = 0;
      settle(2);
      await sleep(120);
    }
    rec.stop();
    await stopped;
    const blob = new Blob(chunks, { type: 'audio/webm' });
    await fetch('http://localhost:3300/' + point.name + '.webm', { method: 'POST', body: blob });
    const report = g.world.plot.report();
    return { name: point.name, kb: Math.round(blob.size / 1024), ...report };
  }

  return async function capture(plan, bars = 16) {
    if (g.state !== 'run') throw new Error('start a run first (ENTER THE SOUNDWOOD), then re-run this');
    g.world.invincible = true;
    window.__progress = { done: 0, total: plan.length, current: null, error: null };
    const log = [];
    for (const point of plan) {
      window.__progress.current = point.name;
      try {
        log.push(await one(point, bars));
      } catch (err) {
        window.__progress.error = `${point.name}: ${err.message}`;
        throw err;
      }
      window.__progress.done++;
    }
    window.__progress.current = 'DONE';
    console.table(log);
    return log;
  };
})();

// ---------------------------------------------------------------------------
// THE PLAN.
//
// 01-07 are docs/baseline/'s own seven build states, played on a stage plot that
// is spread and wired — the shape a competent player's stage ends up in. Same
// weapons, same levels, so the two sets compare point for point and the
// difference is entirely this stack's doing.
//
// 08-11 hold 07's build completely still and change ONLY where the gear stands.
// That block is the measurement this whole stack exists to produce.
//
// Coordinates are world units. A wired ring of five sits at radius ~420; a blob
// is everything inside 40.
const RING = (n, r) => Array.from({ length: n }, (_, i) => {
  const a = (i / n) * Math.PI * 2 - Math.PI / 2;
  return [Math.round(Math.cos(a) * r), Math.round(Math.sin(a) * r)];
});

const spread = (roles, levels, r = 430) => {
  const spots = RING(roles.length, roles.length === 1 ? 0 : r);
  return roles.map((role, i) => [role, levels[i], spots[i][0], spots[i][1]]);
};

window.LOADIN_PLAN = [
  { name: '01-opening-one-weapon', gear: spread(['kick'], [1]) },
  { name: '02-early-two', gear: spread(['kick', 'bass'], [2, 1]) },
  { name: '03-building-three', gear: spread(['kick', 'bass', 'hat'], [3, 3, 1]) },
  { name: '04-mid-four', gear: spread(['kick', 'bass', 'hat', 'chord'], [4, 4, 3, 2]) },
  { name: '05-band-full-five', gear: spread(['kick', 'bass', 'hat', 'chord', 'lead'], [5, 5, 4, 4, 3]) },
  { name: '06-late-five', gear: spread(['kick', 'bass', 'hat', 'chord', 'lead'], [7, 7, 6, 6, 6]) },
  { name: '07-maxed-five-wired', gear: spread(['kick', 'bass', 'hat', 'chord', 'lead'], [8, 8, 8, 8, 8]) },

  // ---- the same build, five different stage plots ------------------------
  {
    name: '08-maxed-five-blob',
    gear: [['kick', 8, 0, 0], ['bass', 8, 22, -16], ['hat', 8, -20, 14], ['chord', 8, 16, 20], ['lead', 8, -14, -22]],
  },
  {
    name: '09-maxed-five-scattered',
    gear: spread(['kick', 'bass', 'hat', 'chord', 'lead'], [8, 8, 8, 8, 8], 1150),
  },
  {
    name: '10-maxed-five-hauling-three',
    gear: spread(['kick', 'bass', 'hat', 'chord', 'lead'], [8, 8, 8, 8, 8]),
    carried: ['bass', 'hat', 'chord'],
  },
  {
    name: '11-maxed-five-hauling-all',
    gear: spread(['kick', 'bass', 'hat', 'chord', 'lead'], [8, 8, 8, 8, 8]),
    carried: ['kick', 'bass', 'hat', 'chord', 'lead'],
  },
];
