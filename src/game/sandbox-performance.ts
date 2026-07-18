// Read-only developer performance sampling. It never advances or mutates the
// simulation; frame deltas are recorded after Pixi's ticker supplies them.

export const SANDBOX_PERFORMANCE_SAMPLE_CAP = 36_000;

export interface SandboxPerformanceCounts {
  readonly live: Readonly<Record<string, number>>;
  readonly transient: Readonly<Record<string, number>>;
}

export interface PixiDrawCallReadout {
  readonly value: number | null;
  readonly source: string;
}

export interface SandboxPerformanceContext {
  readonly drawCalls: PixiDrawCallReadout;
  readonly atlasTextureBytes: number;
  readonly atlasTextureMebibytes: number;
  readonly counts: SandboxPerformanceCounts;
}

export interface SandboxPerformanceSnapshot extends SandboxPerformanceContext {
  readonly sampleCount: number;
  readonly sampledSeconds: number;
  readonly medianFps: number | null;
  readonly onePercentLowFps: number | null;
  /** Exact rolling inputs used for the aggregate calculations. */
  readonly frameTimeMsSamples: readonly number[];
  /** Slowest ceil(1%) frame-time inputs used for the 1%-low value. */
  readonly onePercentLowFrameTimeMsInputs: readonly number[];
}

function finiteNonNegative(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function readPath(root: unknown, path: readonly string[]): unknown {
  let value = root;
  for (const key of path) {
    if (!value || typeof value !== 'object') return undefined;
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}

/** Pixi v8 does not guarantee public draw-call stats. Probe only known
 * read-only locations and report null truthfully when the active renderer does
 * not expose one. */
export function readPixiDrawCalls(renderer: unknown): PixiDrawCallReadout {
  const candidates = [
    ['stats', 'drawCalls'],
    ['stats', 'drawCallCount'],
    ['renderPipes', 'batch', 'stats', 'drawCalls'],
    ['renderPipes', 'batch', 'drawCalls'],
  ] as const;
  for (const path of candidates) {
    const value = finiteNonNegative(readPath(renderer, path));
    if (value !== null) return Object.freeze({ value, source: `renderer.${path.join('.')}` });
  }
  return Object.freeze({ value: null, source: 'renderer-stats-unavailable' });
}

function median(sorted: readonly number[]): number | null {
  if (sorted.length === 0) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle] ?? null
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

export class SandboxPerformanceSampler {
  private readonly frameTimeMs: number[] = [];
  private sampledMs = 0;

  reset(): void {
    this.frameTimeMs.length = 0;
    this.sampledMs = 0;
  }

  recordFrame(deltaMs: number): void {
    if (!(deltaMs > 0) || !Number.isFinite(deltaMs)) return;
    const bounded = Math.min(deltaMs, 1000);
    this.frameTimeMs.push(bounded);
    this.sampledMs += bounded;
    if (this.frameTimeMs.length > SANDBOX_PERFORMANCE_SAMPLE_CAP) {
      const removed = this.frameTimeMs.shift();
      if (removed !== undefined) this.sampledMs -= removed;
    }
  }

  summary(context: SandboxPerformanceContext): Omit<
    SandboxPerformanceSnapshot,
    'frameTimeMsSamples' | 'onePercentLowFrameTimeMsInputs'
  > {
    const sorted = [...this.frameTimeMs].sort((a, b) => a - b);
    const medianMs = median(sorted);
    const slowCount = sorted.length === 0 ? 0 : Math.max(1, Math.ceil(sorted.length * 0.01));
    const slowest = slowCount === 0 ? [] : sorted.slice(-slowCount);
    const slowMeanMs = slowest.length === 0
      ? null
      : slowest.reduce((sum, value) => sum + value, 0) / slowest.length;
    return Object.freeze({
      ...context,
      sampleCount: this.frameTimeMs.length,
      sampledSeconds: this.sampledMs / 1000,
      medianFps: medianMs === null || medianMs <= 0 ? null : 1000 / medianMs,
      onePercentLowFps: slowMeanMs === null || slowMeanMs <= 0 ? null : 1000 / slowMeanMs,
    });
  }

  snapshot(context: SandboxPerformanceContext): SandboxPerformanceSnapshot {
    const samples = Object.freeze([...this.frameTimeMs]);
    const sorted = [...samples].sort((a, b) => a - b);
    const slowCount = sorted.length === 0 ? 0 : Math.max(1, Math.ceil(sorted.length * 0.01));
    const onePercentInputs = Object.freeze(slowCount === 0 ? [] : sorted.slice(-slowCount));
    return Object.freeze({
      ...this.summary(context),
      frameTimeMsSamples: samples,
      onePercentLowFrameTimeMsInputs: onePercentInputs,
    });
  }
}

export function formatSandboxPerformanceSummary(
  summary: ReturnType<SandboxPerformanceSampler['summary']>,
): string {
  const medianFps = summary.medianFps === null ? '—' : summary.medianFps.toFixed(1);
  const lowFps = summary.onePercentLowFps === null ? '—' : summary.onePercentLowFps.toFixed(1);
  const drawCalls = summary.drawCalls.value === null ? 'n/a' : String(Math.round(summary.drawCalls.value));
  const live = Object.values(summary.counts.live).reduce((sum, value) => sum + value, 0);
  const transient = Object.values(summary.counts.transient).reduce((sum, value) => sum + value, 0);
  return `perf ${summary.sampleCount} frames/${summary.sampledSeconds.toFixed(1)}s` +
    ` · median ${medianFps} fps · 1%-low ${lowFps} fps` +
    ` · draws ${drawCalls} · atlas ${summary.atlasTextureMebibytes.toFixed(2)} MiB` +
    ` · live ${live} · transient ${transient}`;
}
