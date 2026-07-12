import { SIM_DT } from '../bot/conductor';
import type { DisposableScope, RoomFixture } from './lifecycle';

export interface ScenarioCapabilities {
  pause?: boolean;
  step?: boolean;
  speed?: boolean;
  audio?: boolean;
  overlays?: boolean;
  viewport?: boolean;
}

export interface ScenarioController {
  readonly presets: readonly string[];
  readonly capabilities: ScenarioCapabilities;
  fixture(): RoomFixture;
  reset(fixture: RoomFixture): void | Promise<void>;
  setPaused?(paused: boolean): void;
  step?(dt: number): void;
  setSpeed?(speed: number): void;
  setAudio?(enabled: boolean): void;
  setOverlays?(enabled: boolean): void;
}

export function fixtureFromUrl(defaults: RoomFixture, url = new URL(location.href)): RoomFixture {
  const controls: Record<string, string | number | boolean> = {};
  for (const [key, value] of url.searchParams) {
    if (key.startsWith('c.')) controls[key.slice(2)] = parseValue(value);
  }
  return {
    preset: url.searchParams.get('preset') ?? defaults.preset,
    seed: parseInteger(url.searchParams.get('seed'), defaults.seed),
    controls,
  };
}

export function urlForFixture(fixture: RoomFixture, base = new URL(location.href)): URL {
  base.search = '';
  base.searchParams.set('preset', fixture.preset);
  base.searchParams.set('seed', String(fixture.seed));
  for (const [key, value] of Object.entries(fixture.controls ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
    base.searchParams.set(`c.${key}`, String(value));
  }
  return base;
}

export function mountScenarioControls(
  root: HTMLElement,
  scope: DisposableScope,
  controller: ScenarioController,
): HTMLElement {
  const bar = document.createElement('div');
  bar.className = 'dev-scenario-controls';
  root.appendChild(bar);

  const preset = document.createElement('select');
  for (const id of controller.presets) preset.add(new Option(id, id));
  preset.value = controller.fixture().preset;
  preset.ariaLabel = 'Preset';
  bar.appendChild(preset);

  const seed = document.createElement('input');
  seed.type = 'number';
  seed.value = String(controller.fixture().seed);
  seed.ariaLabel = 'Seed';
  bar.appendChild(seed);

  const button = (label: string, run: () => void): HTMLButtonElement => {
    const el = document.createElement('button');
    el.textContent = label;
    el.onclick = run;
    bar.appendChild(el);
    return el;
  };
  const current = (): RoomFixture => ({ ...controller.fixture(), preset: preset.value, seed: Number(seed.value) });
  button('Reset', () => void controller.reset(current()));
  button('Reroll', () => {
    seed.value = String((Number(seed.value) + 1) >>> 0);
    void controller.reset(current());
  });

  let paused = false;
  let pause: HTMLButtonElement | null = null;
  if (controller.capabilities.pause) {
    pause = button('Pause', () => {
        paused = !paused;
        if (pause) pause.textContent = paused ? 'Play' : 'Pause';
        controller.setPaused?.(paused);
      });
  }
  if (controller.capabilities.step) button('Step', () => paused && controller.step?.(SIM_DT));
  button('Copy link', () => void navigator.clipboard.writeText(urlForFixture(current()).href));

  scope.listen(window, 'keydown', (event) => {
    if (typing(event.target)) return;
    if (event.key.toLowerCase() === 'r') void controller.reset(current());
    if (event.key === ' ' && pause) {
      event.preventDefault();
      pause.click();
    }
    if (event.key === '.' && paused) controller.step?.(SIM_DT);
  });
  return bar;
}

export function typing(target: EventTarget | null): boolean {
  return target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
}

function parseInteger(value: string | null, fallback: number): number {
  if (value === null) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed >>> 0 : fallback;
}

function parseValue(value: string): string | number | boolean {
  if (value === 'true') return true;
  if (value === 'false') return false;
  const number = Number(value);
  return value.trim() !== '' && Number.isFinite(number) ? number : value;
}
