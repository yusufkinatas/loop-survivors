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
//   node docs/baseline/receiver.mjs --out docs/route --port 3301
//
// and set the sink to match before pasting:  window.__sink = 3301
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
      // Chart and tier together: setVoiceChart's tier argument defaults to 1, so
      // splitting them would reset the rung a bed's presence rides on.
      if (id) e.setVoiceChart(role, P.renderPattern(role, P.pattern(id)), stage(level));
      else e.setVoiceTier(role, stage(level));
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
    await fetch(`http://localhost:${window.__sink ?? 3300}/${name}.webm`, { method: 'POST', body: blob });
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

/** THE ROUTE'S OWN BUILD STATES, and they are the ones a PLAYED ROUTE ACTUALLY
 *  REACHED rather than a guess.
 *
 *  The first pass of this plan was written by hand from the design and came out
 *  half again as busy as the game: it put the summit at thirty hits a bar where a
 *  driven twelve-room route ended at eleven. A capture set that overstates its own
 *  branch is worse than no capture set, so 10-14 are read off the density curve of
 *  the run logged in this directory's README, point for point.
 *
 *  15 and 16 are the BOUNDS the mechanic allows rather than states a run reaches:
 *  the sparsest playable band, and every voice pushed to its ceiling — the mud the
 *  ceilings exist to bound. */
window.ROUTE_PLAN = [
  // Room 1, two shells in: 6 hits a bar.
  ['10-route-opening', { kick: ['anchor', 1], clap: ['backbeat', 1] }],
  // Room 1 played out, four shells at level 1-2: 9 hits a bar, the measured value.
  ['11-route-early-four', {
    kick: ['anchor', 2], clap: ['backbeat', 2], bass: ['drag', 1], sub: ['hold', 1],
  }],
  // Room 3, THE MEASURED PEAK of the logged run: 16 hits a bar off four shells,
  // because a found pattern (The Sprint) went into the hat.
  ['12-route-a-peak', {
    kick: ['anchor', 4], hat: ['sprint', 3], clap: ['backbeat', 3], bass: ['drag', 3],
  }],
  // The gate at room 3 took the hat's notes; the kick came back heavier. 16 -> 8,
  // and this is the take the whole stack stands or falls on.
  ['13-route-after-a-toll', {
    kick: ['anchor', 5, 2], hat: [null], clap: ['backbeat', 4], bass: ['drag', 4],
  }],
  // The band the logged run reached the summit with: five shells, four of them at
  // the weight cap, 9.5 hits a bar. Barely busier than room 1 and much louder.
  ['14-route-summit', {
    shaker: ['walk', 4, 4], bell: ['drag', 5, 4], clap: ['question', 7, 4],
    sub: ['hold', 3, 4], flute: ['hold', 1],
  }],
  ['15-route-thinnest', {
    kick: ['hold', 8], bass: ['hold', 8], sub: ['hold', 8], organ: ['hold', 8], bell: ['hold', 8],
  }],
  ['16-route-busiest', {
    hat: ['rush', 8], shaker: ['rush', 8], arp: ['rush', 8], chord: ['stagger', 8], chank: ['stagger', 8],
  }],
];

/** THE TOLL, AS ONE TAKE, on the numbers above: four bars of the peak, four bars
 *  of the valley the gate leaves, four bars climbing back as the case puts notes
 *  into a shell, four bars of the peak the weight bought.
 *
 *  This is the take the hard floor is about. A static arrangement cannot HAVE a
 *  loudness range — which is why `docs/baseline/` and `docs/palette-control/` both
 *  measured 0.3-0.7 LU at every single point — and this one is the shape a played
 *  route has. */
window.TOLL_MOVE = [
  [{ kick: ['anchor', 4], hat: ['sprint', 3], clap: ['backbeat', 3], bass: ['drag', 3] }, 4],
  [{ kick: ['anchor', 5, 2], hat: [null], clap: ['backbeat', 4], bass: ['drag', 4] }, 4],
  [{ kick: ['anchor', 5, 2], hat: [null], clap: ['backbeat', 5], bass: ['push', 5], lead: ['hold', 3] }, 4],
  // Back to the peak's own density, not past it: the run's measured ceiling is 16
  // hits a bar, and a take that climbed to 24 would be reporting a game this
  // branch does not have.
  [{ kick: ['anchor', 6, 3], hat: ['sprint', 6], clap: ['backbeat', 6], bass: ['drag', 6, 1] }, 4],
];
