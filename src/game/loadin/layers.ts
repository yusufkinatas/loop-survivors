// THE LAYER SWITCHBOARD (#256's in-branch-toggle rule, generalised from #255's
// constraint on The Call).
//
// Every layer this stack adds is individually switchable, so each one earns its
// own verdict instead of the stack getting one blurred thumbs-up or -down. The
// rule the map states is: "every layer in every stack is individually
// switchable so each gets its own verdict."
//
// Read at RUN START, not per frame. A run is the unit of judgement here — a
// stage plot half-built under masking and half without would tell nobody
// anything — so the panel writes to storage and the next run picks it up. The
// one exception is `plot`, which is a readout rather than a mechanic and can be
// toggled live.
//
// Persisted in localStorage so an A/B survives a reload, and mirrored into the
// URL hash so a specific configuration can be sent to someone.

export interface LayerDef {
  readonly key: LayerKey;
  readonly label: string;
  /** What turning it OFF gives you — the control side of the A/B. */
  readonly off: string;
  readonly on: boolean;
}

export type LayerKey =
  | 'placement'
  | 'panning'
  | 'hauling'
  | 'quantizeDrop'
  | 'masking'
  | 'cables'
  | 'knockdown'
  | 'venue'
  | 'sockets'
  | 'exclusivity'
  | 'mergedKit'
  | 'crew'
  | 'crowd';

/** Ordered from the load-bearing to the optional: `placement` is the stack, and
 *  everything under it is a thing the stack does. Turning `placement` off makes
 *  every weapon fire from the player again — that is the base game, in-branch,
 *  which is the cheapest A/B in the build. */
export const LAYERS: readonly LayerDef[] = [
  { key: 'placement', label: 'gear stands on the map', on: true,
    off: 'weapons fire from the player, as the base does' },
  { key: 'panning', label: 'position pans', on: true,
    off: 'the band stays centred wherever it stands' },
  { key: 'hauling', label: 'hauling', on: true,
    off: 'gear is bolted down — the tower-defence half of the designer’s open question' },
  { key: 'quantizeDrop', label: 'the drop lands on a bar line', on: false,
    off: 'gear re-enters the instant it is set down' },
  { key: 'masking', label: 'masking (the anti-blob rule)', on: true,
    off: 'gear standing on top of itself costs nothing' },
  { key: 'cables', label: 'cables', on: true,
    off: 'no adjacency bonus; spreading out buys only coverage' },
  { key: 'knockdown', label: 'gear can be knocked over', on: true,
    off: 'gear is indestructible' },
  { key: 'venue', label: 'a bounded venue', on: true,
    off: 'the endless plane the base runs on' },
  { key: 'sockets', label: 'power sockets', on: true,
    off: 'the floor is featureless; every spot is the same spot' },
  { key: 'exclusivity', label: 'one slot per seat', on: true,
    off: 'the base’s flat cap of five, any five weapons' },
  { key: 'mergedKit', label: 'percussion hauls as one kit', on: true,
    off: 'every drum is its own box (visible only with seat slots off)' },
  { key: 'crew', label: 'crew (the second currency)', on: true,
    off: 'weapons only, and the decision stream dies at minute fourteen' },
  { key: 'crowd', label: 'The Crowd — convert, don’t kill', on: false,
    off: 'The Hush dies as usual and the only loss is your own health' },
];

export type Layers = Readonly<Record<LayerKey, boolean>>;

const STORAGE_KEY = 'loop.loadin.layers';

function defaults(): Record<LayerKey, boolean> {
  const out = {} as Record<LayerKey, boolean>;
  for (const layer of LAYERS) out[layer.key] = layer.on;
  return out;
}

/** Layer state as the panel edits it. A module-level singleton on purpose: a
 *  run reads it once at construction and never again, so there is nothing to
 *  thread and nothing that can drift mid-run. */
let current: Record<LayerKey, boolean> = load();

function load(): Record<LayerKey, boolean> {
  const out = defaults();
  // Defended because this module is imported by `tools/verify-loadin.ts`, which
  // runs under tsx with no DOM at all. A headless harness that cannot import the
  // layer definitions cannot check a layer, and checking layers is the point.
  if (typeof location === 'undefined') return out;
  const fromHash = new URLSearchParams(location.hash.replace(/^#/, '')).get('layers');
  const raw = fromHash ?? readStorage();
  if (!raw) return out;
  // Comma-separated `key` / `-key`: present means on, minus-prefixed means off.
  // Unknown keys are ignored rather than rejected, so a link written before a
  // layer existed still opens.
  for (const token of raw.split(',')) {
    const off = token.startsWith('-');
    const key = (off ? token.slice(1) : token) as LayerKey;
    if (key in out) out[key] = !off;
  }
  return out;
}

function readStorage(): string | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** The compact form the panel stores and a shared link carries. */
export function serializeLayers(state: Layers = current): string {
  return LAYERS.map((layer) => (state[layer.key] ? layer.key : `-${layer.key}`)).join(',');
}

export function layers(): Layers {
  return current;
}

export function setLayer(key: LayerKey, on: boolean): void {
  current = { ...current, [key]: on };
  try {
    localStorage.setItem(STORAGE_KEY, serializeLayers());
  } catch {
    // Private-mode storage refusal is not worth a broken panel.
  }
}

export function resetLayers(): void {
  current = defaults();
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // See above.
  }
}

/** True when every layer sits at its shipped default — what the run report
 *  needs to say, because a verdict read off a non-default configuration is a
 *  verdict about a different game. */
export function layersAtDefault(): boolean {
  return LAYERS.every((layer) => current[layer.key] === layer.on);
}

/** Layers that differ from the default, for the run report and the HUD. */
export function layerDiff(): string[] {
  return LAYERS.filter((layer) => current[layer.key] !== layer.on)
    .map((layer) => `${current[layer.key] ? '+' : '−'} ${layer.label}`);
}
