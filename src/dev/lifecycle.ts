/** Disposable ownership primitives for Dev Campus rooms.
 *
 * A room owns every mutable resource it creates. Immutable decoded buffers may
 * be shared through the app-level MusicEngine; listeners, timers, animation
 * frames, Pixi applications, audio transport state, and DOM nodes may not. */

export interface RoomSession<State = unknown> {
  readonly initialState: State;
  reset(state: State): void | Promise<void>;
  serialize(): State;
  dispose(): void | Promise<void>;
}

export class DisposeBag {
  private cleanups: Array<() => void | Promise<void>> = [];
  private disposed = false;

  add(cleanup: () => void | Promise<void>): () => void {
    if (this.disposed) {
      void cleanup();
      return () => {};
    }
    let live = true;
    const once = () => {
      if (!live) return;
      live = false;
      return cleanup();
    };
    this.cleanups.push(once);
    return once;
  }

  listen<K extends keyof WindowEventMap>(
    target: Window,
    type: K,
    listener: (event: WindowEventMap[K]) => void,
    options?: AddEventListenerOptions | boolean,
  ): () => void;
  listen<K extends keyof DocumentEventMap>(
    target: Document,
    type: K,
    listener: (event: DocumentEventMap[K]) => void,
    options?: AddEventListenerOptions | boolean,
  ): () => void;
  listen(
    target: EventTarget,
    type: string,
    listener: EventListener,
    options?: AddEventListenerOptions | boolean,
  ): () => void;
  listen(
    target: EventTarget,
    type: string,
    listener: EventListener,
    options?: AddEventListenerOptions | boolean,
  ): () => void {
    target.addEventListener(type, listener, options);
    return this.add(() => target.removeEventListener(type, listener, options));
  }

  animationFrame(frame: (time: number) => void): () => void {
    let id = 0;
    let live = true;
    const loop = (time: number) => {
      if (!live || this.disposed) return;
      frame(time);
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return this.add(() => {
      live = false;
      cancelAnimationFrame(id);
    });
  }

  interval(fn: () => void, delayMs: number): () => void {
    const id = window.setInterval(fn, delayMs);
    return this.add(() => clearInterval(id));
  }

  timeout(fn: () => void, delayMs: number): () => void {
    const id = window.setTimeout(fn, delayMs);
    return this.add(() => clearTimeout(id));
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    const cleanups = this.cleanups.splice(0).reverse();
    const errors: unknown[] = [];
    for (const cleanup of cleanups) {
      try {
        await cleanup();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length > 0) {
      throw new AggregateError(errors, 'Dev Campus session disposal failed');
    }
  }
}

export function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}
