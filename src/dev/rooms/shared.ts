import { SIM_DT } from '../../bot/conductor';
import { DisposableScope, type DevRoom, type RoomFixture, type RoomSession } from '../lifecycle';
import { mountScenarioControls } from '../scenario';

export interface RoomSection {
  readonly title: string;
  readonly body: string;
  readonly facts?: readonly (readonly [string, string | number])[];
}

export function informativeRoom(
  id: string,
  title: string,
  description: string,
  sections: readonly RoomSection[],
  presets: readonly string[] = ['canonical'],
): DevRoom {
  const defaultFixture: RoomFixture = { preset: presets[0], seed: 271828, controls: {} };
  return {
    id,
    defaultFixture,
    async mount(root, initialFixture) {
      const scope = new DisposableScope();
      let fixture = initialFixture;
      let ticks = 0;
      const article = document.createElement('article');
      article.className = 'dev-article';
      root.appendChild(article);
      const render = () => {
        article.innerHTML = `<h1>${title}</h1><p>${description}</p><p class="dev-fixture">preset <b>${fixture.preset}</b> · seed <b>${fixture.seed}</b> · fixed ticks <b>${ticks}</b></p>` +
          sections.map((section) => `<section><h2>${section.title}</h2><p>${section.body}</p>${section.facts ? `<dl>${section.facts.map(([key, value]) => `<dt>${key}</dt><dd>${value}</dd>`).join('')}</dl>` : ''}</section>`).join('');
      };
      const controller = {
        presets,
        capabilities: { pause: true, step: true },
        fixture: () => fixture,
        reset(next: RoomFixture) { fixture = next; ticks = 0; render(); },
        setPaused() {},
        step(dt: number) { if (dt === SIM_DT) { ticks++; render(); } },
      };
      const controls = mountScenarioControls(root, scope, controller);
      root.insertBefore(controls, article);
      render();
      return session(scope, () => fixture, (next) => controller.reset(next), () => ({ fixture, ticks }));
    },
  };
}

export function session(
  scope: DisposableScope,
  fixture: () => RoomFixture,
  reset: (fixture: RoomFixture) => void | Promise<void>,
  serialize: () => unknown,
): RoomSession {
  return {
    get fixture() { return fixture(); },
    serialize,
    reset: async (next = fixture()) => reset(next),
    dispose: () => scope.dispose(),
  };
}
