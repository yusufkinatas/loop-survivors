export interface DevFixture {
  preset: string;
  seed: number;
  playing: boolean;
  speed: number;
  audio: boolean;
  overlays: boolean;
  viewport: string;
  values: Record<string, string>;
}

export const DEFAULT_FIXTURE: DevFixture = {
  preset: 'default',
  seed: 1337,
  playing: true,
  speed: 1,
  audio: true,
  overlays: true,
  viewport: 'desktop',
  values: {},
};

function finite(value: string | null, fallback: number): number {
  const parsed = value === null ? Number.NaN : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function parseFixture(query: string, fallback = DEFAULT_FIXTURE): DevFixture {
  const params = new URLSearchParams(query);
  const values: Record<string, string> = {};
  for (const [key, value] of params) {
    if (!['preset', 'seed', 'play', 'speed', 'audio', 'overlays', 'viewport'].includes(key)) {
      values[key] = value;
    }
  }
  return {
    preset: params.get('preset') ?? fallback.preset,
    seed: Math.trunc(finite(params.get('seed'), fallback.seed)) >>> 0,
    playing: (params.get('play') ?? String(Number(fallback.playing))) !== '0',
    speed: Math.max(0.25, Math.min(10, finite(params.get('speed'), fallback.speed))),
    audio: (params.get('audio') ?? String(Number(fallback.audio))) !== '0',
    overlays: (params.get('overlays') ?? String(Number(fallback.overlays))) !== '0',
    viewport: params.get('viewport') ?? fallback.viewport,
    values,
  };
}

export function serializeFixture(fixture: DevFixture): string {
  const params = new URLSearchParams();
  params.set('preset', fixture.preset);
  params.set('seed', String(fixture.seed >>> 0));
  params.set('play', fixture.playing ? '1' : '0');
  params.set('speed', String(fixture.speed));
  params.set('audio', fixture.audio ? '1' : '0');
  params.set('overlays', fixture.overlays ? '1' : '0');
  params.set('viewport', fixture.viewport);
  for (const [key, value] of Object.entries(fixture.values).sort(([a], [b]) => a.localeCompare(b))) {
    params.set(key, value);
  }
  return params.toString();
}

export function cloneFixture(fixture: DevFixture): DevFixture {
  return { ...fixture, values: { ...fixture.values } };
}

/** Apply a preset's compact value bag without allowing reserved shared fields
 * to hide inside room-specific values. */
export function applyFixtureValues(
  fixture: DevFixture,
  values: Readonly<Record<string, string>> = {},
): DevFixture {
  const next = cloneFixture(fixture);
  for (const [key, value] of Object.entries(values)) {
    switch (key) {
      case 'preset': next.preset = value; break;
      case 'seed': next.seed = Math.trunc(Number(value)) >>> 0; break;
      case 'play': next.playing = value !== '0'; break;
      case 'speed': next.speed = Math.max(0.25, Math.min(10, Number(value) || 1)); break;
      case 'audio': next.audio = value !== '0'; break;
      case 'overlays': next.overlays = value !== '0'; break;
      case 'viewport': next.viewport = value; break;
      default: next.values[key] = value;
    }
  }
  return next;
}
