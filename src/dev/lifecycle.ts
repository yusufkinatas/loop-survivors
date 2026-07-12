export interface RoomFixture {
  readonly preset: string;
  readonly seed: number;
  readonly controls?: Readonly<Record<string, string | number | boolean>>;
}

export interface RoomSession {
  readonly fixture: RoomFixture;
  serialize(): unknown;
  reset(fixture?: RoomFixture): Promise<void>;
  dispose(): Promise<void>;
}

export interface DevRoom {
  readonly id: string;
  readonly defaultFixture: RoomFixture;
  mount(root: HTMLElement, fixture: RoomFixture): Promise<RoomSession>;
}

type Cleanup = () => void | Promise<void>;

/** Owns every mutable browser resource created by one mounted room. */
export class DisposableScope {
  private cleanups: Cleanup[] = [];
  private disposed = false;

  add<T extends Cleanup>(cleanup: T): T {
    if (this.disposed) throw new Error('cannot add resources to a disposed scope');
    this.cleanups.push(cleanup);
    return cleanup;
  }

  listen<K extends keyof WindowEventMap>(
    target: Window,
    type: K,
    listener: (event: WindowEventMap[K]) => void,
    options?: AddEventListenerOptions,
  ): void;
  listen<K extends keyof HTMLElementEventMap>(
    target: HTMLElement | Document,
    type: K,
    listener: (event: HTMLElementEventMap[K]) => void,
    options?: AddEventListenerOptions,
  ): void;
  listen(
    target: Window | HTMLElement | Document,
    type: string,
    listener: EventListener,
    options?: AddEventListenerOptions,
  ): void {
    target.addEventListener(type, listener, options);
    this.add(() => target.removeEventListener(type, listener, options));
  }

  timeout(fn: () => void, ms: number): number {
    const id = window.setTimeout(fn, ms);
    this.add(() => window.clearTimeout(id));
    return id;
  }

  animationFrame(fn: FrameRequestCallback): void {
    let id = 0;
    const frame = (time: number) => {
      if (this.disposed) return;
      fn(time);
      id = requestAnimationFrame(frame);
    };
    id = requestAnimationFrame(frame);
    this.add(() => cancelAnimationFrame(id));
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    const cleanups = this.cleanups.splice(0).reverse();
    const failures: unknown[] = [];
    for (const cleanup of cleanups) {
      try {
        await cleanup();
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length) throw new AggregateError(failures, 'room disposal failed');
  }
}

/** Serializes resets and switches so two mutable sessions never overlap. */
export class RoomHost {
  private current: RoomSession | null = null;
  private transition: Promise<void> = Promise.resolve();

  constructor(private readonly root: HTMLElement) {}

  mount(room: DevRoom, fixture: RoomFixture = room.defaultFixture): Promise<void> {
    this.transition = this.transition.then(async () => {
      await this.current?.dispose();
      this.current = null;
      this.root.replaceChildren();
      this.current = await room.mount(this.root, fixture);
    });
    return this.transition;
  }

  async reset(fixture?: RoomFixture): Promise<void> {
    await this.transition;
    if (!this.current) return;
    await this.current.reset(fixture);
  }

  dispose(): Promise<void> {
    this.transition = this.transition.then(async () => {
      await this.current?.dispose();
      this.current = null;
      this.root.replaceChildren();
    });
    return this.transition;
  }
}
