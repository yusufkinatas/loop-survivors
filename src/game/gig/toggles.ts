// THE GIG's in-branch layer toggles (#256: "every layer in every stack is
// individually switchable so each gets its own verdict").
//
// Five layers ride this branch and each one gets its own answer:
//
//   takes        the recording mechanic — the player performs every pattern
//   autoTakes    the system performs them instead (the A/B for "does MAKING
//                it beat FINDING it?", which is #268's actual question)
//   songs        the three-song set: three tempos, three curves, changeovers
//   swap         the changeover's give-something-up move
//   evoTape      evolution buys tape, so max level is finally audible
//   tempoComp    per-trigger damage scaled against the song's tempo
//
// Read from the URL query so a capture or a play session is reproducible from a
// link, and persisted to localStorage so the pinned dev port keeps its setting:
//
//   ?gig=takes,songs            only those two on
//   ?gig=all                    everything on (the default)
//   ?gig=none                   the base game, on this branch's code
//   ?gig=all,-takes             everything except recording
//
// The DEFAULT is everything on. A prototype's job is to be playable as its
// whole self first; the toggles are for attribution afterwards.

export const GIG_LAYERS = [
  'takes',
  'autoTakes',
  'songs',
  'swap',
  'evoTape',
  'tempoComp',
] as const;

export type GigLayer = (typeof GIG_LAYERS)[number];

/** Layers that are OFF in the "all" default: autoTakes is the control arm of
 *  the experiment, not part of the stack. */
const OFF_IN_ALL: ReadonlySet<GigLayer> = new Set<GigLayer>(['autoTakes']);

const STORAGE_KEY = 'gig.layers';

function allOn(): Set<GigLayer> {
  return new Set(GIG_LAYERS.filter((layer) => !OFF_IN_ALL.has(layer)));
}

function parse(spec: string): Set<GigLayer> {
  const known = new Set<string>(GIG_LAYERS);
  let on = new Set<GigLayer>();
  for (const raw of spec.split(/[,\s]+/)) {
    const token = raw.trim();
    if (!token) continue;
    if (token === 'all') { on = allOn(); continue; }
    if (token === 'none') { on = new Set(); continue; }
    const negated = token.startsWith('-') || token.startsWith('!');
    const name = negated ? token.slice(1) : token;
    if (!known.has(name)) continue;
    if (negated) on.delete(name as GigLayer);
    else on.add(name as GigLayer);
  }
  return on;
}

function load(): Set<GigLayer> {
  const fromUrl = new URLSearchParams(location.search).get('gig');
  if (fromUrl !== null) {
    const parsed = parse(fromUrl);
    save(parsed);
    return parsed;
  }
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved !== null) return parse(saved);
  } catch {
    // Private browsing or a blocked store: fall through to the default.
  }
  return allOn();
}

function save(on: ReadonlySet<GigLayer>): void {
  try {
    localStorage.setItem(STORAGE_KEY, [...on].join(','));
  } catch {
    // Not being able to remember the setting is not worth failing a run over.
  }
}

const on = load();

/** Is this layer live? The one question the rest of the branch asks. */
export function gigOn(layer: GigLayer): boolean {
  return on.has(layer);
}

/** Flip a layer. Takes effect on the NEXT run, not mid-run: half the layers
 *  change what a run shape is, and a run cannot be half of two shapes. */
export function setGigLayer(layer: GigLayer, value: boolean): void {
  if (value) on.add(layer);
  else on.delete(layer);
  save(on);
}

/** The live set, for the dev row and the console handle. */
export function gigLayers(): Record<GigLayer, boolean> {
  return Object.fromEntries(GIG_LAYERS.map((l) => [l, on.has(l)])) as Record<GigLayer, boolean>;
}

/** One-line summary for the title screen and the capture log, so a session
 *  never has to guess which arms were live. */
export function gigLayerSummary(): string {
  const live = GIG_LAYERS.filter((l) => on.has(l));
  return live.length === 0 ? 'base (no gig layers)' : live.join(' · ');
}
