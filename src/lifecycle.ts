/** A mounted application surface or Dev Campus room. Disposal is always
 * awaited before another surface mounts. Reset is deliberately not part of
 * this contract: scenario rooms implement reset by disposing their session
 * and recreating it from serialized fixture data. */
export interface DisposableSession {
  dispose(): void | Promise<void>;
}

/** Small ownership helper for DOM listeners, timers, animation frames, and
 * arbitrary teardown callbacks. It makes lifecycle cleanup explicit without
 * introducing a UI framework. */
export class ResourceScope implements DisposableSession {
  private cleanups: Array<() => void | Promise<void>> = [];
  private disposed = false;

  own(cleanup: () => void | Promise<void>): void {
    if (this.disposed) {
      void cleanup();
      return;
    }
    this.cleanups.push(cleanup);
  }

  listen<K extends keyof WindowEventMap>(
    target: Window,
    type: K,
    listener: (event: WindowEventMap[K]) => void,
    options?: boolean | AddEventListenerOptions,
  ): void;
  listen<K extends keyof DocumentEventMap>(
    target: Document,
    type: K,
    listener: (event: DocumentEventMap[K]) => void,
    options?: boolean | AddEventListenerOptions,
  ): void;
  listen<K extends keyof HTMLElementEventMap>(
    target: HTMLElement,
    type: K,
    listener: (event: HTMLElementEventMap[K]) => void,
    options?: boolean | AddEventListenerOptions,
  ): void;
  listen(
    target: Window | Document | HTMLElement,
    type: string,
    listener: EventListener,
    options?: boolean | AddEventListenerOptions,
  ): void {
    target.addEventListener(type, listener, options);
    this.own(() => target.removeEventListener(type, listener, options));
  }

  animationFrame(frame: (time: number) => void): void {
    let id = 0;
    const tick = (time: number): void => {
      if (this.disposed) return;
      frame(time);
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    this.own(() => cancelAnimationFrame(id));
  }

  timeout(fn: () => void, ms: number): number {
    const id = window.setTimeout(fn, ms);
    this.own(() => window.clearTimeout(id));
    return id;
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    for (const cleanup of this.cleanups.splice(0).reverse()) await cleanup();
  }
}

/** Hotkeys must never activate while the developer is typing or operating a
 * select/range control. */
export function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}
