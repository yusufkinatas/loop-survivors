// THE ROUTE's capture rig (#267). An extension of `docs/baseline/capture-rig.js`,
// not a replacement: paste that one first for the nine reference builds, and this
// one for the takes that need something the base cannot express.
//
// Two things the base rig cannot do, and both are the point of this stack:
//
//   AN ARRANGEMENT MADE OF PATTERNS. The base rig sets a LEVEL and the engine
//   picks the authored rung. Here the notes are the loot, so a take has to be
//   able to say "the Kick is playing The Hold and the Hat is playing The Rush" —
//   which is a chart the ladder never contained.
//
//   AN ARRANGEMENT THAT CHANGES INSIDE ONE TAKE. `docs/baseline/` and
//   `docs/palette-control/` both measured loudness range at 0.3-0.7 LU
//   EVERYWHERE, and the reason is structural rather than mixing: every take is a
//   static build, and a static build has no range to measure. The hard floor
//   (#256) asks about A RUN's loudness range, and a run on this route thins out at
//   every gate. So `__captureMoving` records one take across a scripted sequence of
//   arrangements, changing on bar lines — which is the shape a played route
//   actually has.
//
// Needs the dev server (it imports the branch's own module), the Sandbox open and
// RESUMED, and the receiver running:
//
//   node docs/baseline/receiver.mjs --out docs/route
//
// Then paste this file and: await __captureRoute(ROUTE_PLAN)
//                           await __captureMoving('20-the-toll', TOLL_MOVE)
//
// Do not edit anything under src/ while a capture runs: Vite's hot reload replaces
// the page and takes the rig with it.

window.__routeRig = await (async () => {
  const e = window.loop.engine;
  const ctx = e.ctx;
  const P = await import('/src/game/route/patterns.ts');

  const secPerBar = () => (4 * 60) / e.clock.bpm;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const stage = (level) => Math.max(1, Math.min(4, Math.ceil(level / 2)));

  // The same two trims the build applies (route/build.ts): a level buys a little
  // presence and a weight stack buys a lot. Kept as literals here rather than
  // imported, so a take records the numbers it was actually taken at even if the
  // build's constants move later.
  const LEVEL_TRIM_DB = 0.35;
  const WEIGHT_TRIM_DB = 1.2;

  /** An arrangement: { role: [patternId, level, weight?] }. A role absent is off.
   *  A bed role (`pad`, `air`) takes [null, level] — it has no notes. */
  const setArrangement = (arrangement) => {
    for (const role of e.voices.keys()) {
      const entry = arrangement[role];
      if (!entry) {
        e.setVoiceEnabled(role, false);
        e.setVoiceTrim(role, 0);
        continue;
      }
      const [id, level = 1, weight = 0] = entry;
      e.setVoiceTier(role, stage(level));
      if (id) e.setVoiceChart(role, P.renderPattern(role, P.pattern(id)));
      e.setVoiceTrim(role, (level - 1) * LEVEL_TRIM_DB + weight * WEIGHT_TRIM_DB);
      e.setVoiceEnabled(role, true);
    }
  };

  /** Hits per bar of an arrangement — the number every table in `docs/` compares. */
  const densityOf = (arrangement) => Object.entries(arrangement)
    .reduce((total, [role, entry]) => {
      if (!entry || !entry[0]) return total;
      const p = P.pattern(entry[0]);
      return total + (P.shellFits(role, p) ? p.steps.length / p.bars : 0);
    }, 0);

  const dest = ctx.createMediaStreamDestination();
  e.analyser.connect(dest);

  const atPhrase = () =>
    new Promise((res) => e.atNextPhrase((t) => res(t))).then(async (t) => {
      const wait = (t - ctx.currentTime) * 1000;
      if (wait > 0) await sleep(wait);
      return t;
    });

  const record = async (name, bars, duringBars) => {
    const rec = new MediaRecorder(dest.stream, {
      mimeType: 'audio/webm;codecs=opus',
      audioBitsPerSecond: 128000,
    });
    const chunks = [];
    rec.ondataavailable = (ev) => ev.data.size && chunks.push(ev.data);
    const stopped = new Promise((r) => (rec.onstop = r));
    rec.start();
    await duringBars(bars);
    rec.stop();
    await stopped;
    const blob = new Blob(chunks, { type: 'audio/webm' });
    await fetch('http://localhost:3300/' + name + '.webm', { method: 'POST', body: blob });
    return { name, bars, kb: Math.round(blob.size / 1024) };
  };

  /** One static take: set the arrangement on a phrase line, play it in for a full
   *  phrase, then record from the next one. Identical procedure to the base rig,
   *  so a route take and a baseline take are comparable point for point. */
  const one = async (name, arrangement, bars) => {
    await atPhrase();
    setArrangement(arrangement);
    await sleep(secPerBar() * 4 * 1000);
    await atPhrase();
    return record(name, bars, (n) => sleep(secPerBar() * n * 1000));
  };

  /** One MOVING take: a sequence of [arrangement, bars] played back to back, each
   *  change landing on a bar line, recorded as one file. This is what a stretch of
   *  a played route sounds like, and it is the only kind of take that can have a
   *  loudness range at all. */
  const moving = async (name, timeline) => {
    const first = timeline[0][0];
    await atPhrase();
    setArrangement(first);
    await sleep(secPerBar() * 4 * 1000);
    await atPhrase();
    const total = timeline.reduce((sum, [, bars]) => sum + bars, 0);
    return record(name, total, async () => {
      for (const [arrangement, bars] of timeline) {
        setArrangement(arrangement);
        await sleep(secPerBar() * bars * 1000);
      }
    });
  };

  return { setArrangement, densityOf, one, moving, patterns: P };
})();

/** Run a plan of static takes. Progress at window.__progress. */
window.__captureRoute = async (plan, bars = 16) => {
  window.__progress = { done: 0, total: plan.length, current: null, error: null };
  const log = [];
  for (const [name, arrangement] of plan) {
    window.__progress.current = name;
    try {
      log.push({
        ...(await window.__routeRig.one(name, arrangement, bars)),
        density: window.__routeRig.densityOf(arrangement),
      });
    } catch (err) {
      window.__progress.error = `${name}: ${err.message}`;
      throw err;
    }
    window.__progress.done++;
  }
  window.__progress.current = 'DONE';
  return log;
};

window.__captureMoving = (name, timeline) => window.__routeRig.moving(name, timeline);

// ---------------------------------------------------------------------------
// The plans
// ---------------------------------------------------------------------------

/** THE ROUTE'S OWN BUILD STATES, walked in the order a run reaches them.
 *
 *  10-13 are the arrangement a route actually produces: the opening band, the
 *  band after a few patterns have been found, a band that has paid two tolls (two
 *  voices silent, one carrying weight), and the summit. 14 and 15 are the bounds
 *  the mechanic allows — the sparsest playable band and the busiest. */
window.ROUTE_PLAN = [
  ['10-route-opening', {
    kick: ['anchor', 1], clap: ['backbeat', 1],
  }],
  ['11-route-early-four', {
    kick: ['anchor', 2], clap: ['backbeat', 2], bass: ['drag', 1], hat: ['push', 1],
  }],
  ['12-route-found-patterns', {
    kick: ['anchor', 4], clap: ['backbeat', 4], bass: ['push', 3], hat: ['sprint', 3], lead: ['stagger', 2],
  }],
  ['13-route-after-two-tolls', {
    // Two voices fed to gates and gone quiet; the two kept are carrying the weight.
    kick: ['anchor', 5, 2], bass: ['hold', 5, 1], hat: [null], clap: [null], lead: ['question', 3],
  }],
  ['14-route-summit', {
    kick: ['anchor', 8, 2], bass: ['push', 8, 1], hat: ['rush', 8], chord: ['stagger', 8], lead: ['wholeStory', 8, 1],
  }],
  ['15-route-thinnest', {
    // Every voice on its sparsest legal pattern: the floor of the mechanic.
    kick: ['hold', 8], bass: ['hold', 8], sub: ['hold', 8], organ: ['hold', 8], bell: ['hold', 8],
  }],
  ['16-route-busiest', {
    // Every voice at its ceiling: the mud the ceilings are there to bound.
    hat: ['rush', 8], shaker: ['rush', 8], arp: ['rush', 8], chord: ['stagger', 8], chank: ['stagger', 8],
  }],
];

/** THE TOLL, AS ONE TAKE. Four bars of a full band, four bars of the valley a toll
 *  leaves, four bars climbing back as patterns are re-slotted, four bars of the
 *  peak the weight bought. This is the take the hard floor is about: a static
 *  arrangement cannot have a loudness range, and this one is what a run does. */
window.TOLL_MOVE = [
  [{ kick: ['anchor', 5], clap: ['backbeat', 5], bass: ['push', 5], hat: ['sprint', 5], lead: ['stagger', 4] }, 4],
  // The gate takes the hat's notes and the clap's; the bass comes back heavier.
  [{ kick: ['anchor', 5], clap: [null], bass: ['hold', 5, 2], hat: [null], lead: ['stagger', 4] }, 4],
  // Back up: the case puts notes into the clap, then the hat.
  [{ kick: ['anchor', 5], clap: ['backbeat', 5], bass: ['hold', 5, 2], hat: [null], lead: ['stagger', 4] }, 4],
  [{ kick: ['anchor', 6, 1], clap: ['backbeat', 6], bass: ['push', 6, 2], hat: ['sprint', 6], lead: ['stagger', 6, 1] }, 4],
];
