// THE CIRCUIT'S LAYER SWITCHES (#270, rule from #256).
//
// "Layers ride as in-branch toggles — every layer in every stack is
// individually switchable so each gets its own verdict." This stack is three
// packages from #255 (7 The Night Out, 2 Headroom, 10 Coverage) and its ticket
// names ONE of the eight combinations as the load-bearing A/B:
//
//   Coverage on/off — the direct test of whether Coverage saves Headroom's
//   pistol test. Run it both ways and watch specifically for whether a fresh
//   fifth weapon is worth switching on.
//
// All three default ON, because all-on is the stack. Turning one off does not
// degrade gracefully into the base — it degrades into a NAMED, DIFFERENT game,
// and the table below says which:
//
//   headroom off  -> The Night Out + Coverage. A venue crawl where you retool
//                    against a telegraphed roster and nothing costs anything to
//                    keep switched on. Coverage without a reason to go thin.
//   coverage off  -> The Night Out + Headroom. The upkeep budget with no answer
//                    matrix, which is EXACTLY the configuration #255 says fails
//                    the pistol test. If it fails here and passes with Coverage
//                    on, that is the finding this stack was assembled to get.
//   nightOut off  -> Headroom + Coverage on Mad Forest's clock and its wave
//                    table. One arena, one tempo, no route, no telegraph — so
//                    retooling has no information behind it. #255 left this as
//                    Coverage's open debt; this is what the debt looks like.
//
// Read once at boot from the query string, because the run has to be reloadable
// into the same configuration for a capture to be comparable. `?circuit=` with a
// comma list turns ON exactly what it names and nothing else; `?circuit=none`
// is the base's control behaviour with the whole stack dark.

export interface CircuitToggles {
  /** The upkeep economy: a shared pool, per-trigger draw, brownout, Blackout. */
  headroom: boolean;
  /** The answer matrix: armoured / shielded / phasing bodies keyed to attack. */
  coverage: boolean;
  /** The handcrafted venue map, the night clock, and per-venue tempo/pressure. */
  nightOut: boolean;
}

const LAYERS = ['headroom', 'coverage', 'nightOut'] as const;

/** The switch list, from the query string in the browser or `CIRCUIT=` in the
 *  environment for the headless harness. Both spellings matter: the browser one is
 *  how a capture is made reproducible, and the environment one is how
 *  `tools/play-the-night.ts` can measure a layer off — which is the only way the
 *  Coverage on/off A/B this ticket asks for produces a number rather than an
 *  impression. */
function toggleSource(): string | null {
  if (typeof location !== 'undefined') {
    const fromUrl = new URLSearchParams(location.search).get('circuit');
    if (fromUrl !== null) return fromUrl;
  }
  if (typeof process !== 'undefined' && process.env?.CIRCUIT) return process.env.CIRCUIT;
  return null;
}

function readToggles(): CircuitToggles {
  const all: CircuitToggles = { headroom: true, coverage: true, nightOut: true };
  const raw = toggleSource();
  if (raw === null) return all;
  const wanted = new Set(raw.split(',').map((part) => part.trim().toLowerCase()).filter(Boolean));
  if (wanted.has('all')) return all;
  const out: CircuitToggles = { headroom: false, coverage: false, nightOut: false };
  for (const layer of LAYERS) if (wanted.has(layer.toLowerCase())) out[layer] = true;
  return out;
}

/** The live configuration. Fixed for the page's lifetime on purpose: a layer
 *  that could be switched mid-run would make every measurement taken after the
 *  switch un-attributable, and the whole point of the toggles is attribution. */
export const CIRCUIT: CircuitToggles = readToggles();

/** What to print in the run report and the dev overlay, so a capture can never
 *  be mistaken for one taken under a different configuration. */
export function circuitLabel(): string {
  const on = LAYERS.filter((layer) => CIRCUIT[layer]);
  if (on.length === LAYERS.length) return 'THE CIRCUIT';
  if (on.length === 0) return 'BASE (no layers)';
  return on.join(' + ');
}
