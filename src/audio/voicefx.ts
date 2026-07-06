// Per-voice sound-effect nodes (Feature 4): a small Web-Audio graph inserted
// between a voice's gain and the master bus. Pure audio, no game imports — the
// gameplay twin of each effect lives in src/game/effects.ts. Real-time only;
// the headless bot never builds these (it has no MusicEngine).

export type EffectId = 'drive' | 'crush' | 'echo' | 'bloom' | 'weight' | 'split';
export const EFFECT_IDS: readonly EffectId[] = ['drive', 'crush', 'echo', 'bloom', 'weight', 'split'];

export interface EffectNodes {
  input: AudioNode;
  output: AudioNode;
  nodes: AudioNode[];
}

function driveCurve(k = 8): Float32Array {
  const n = 1024,
    c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(k * x) / Math.tanh(k);
  }
  return c;
}
function crushCurve(bits = 5): Float32Array {
  const n = 1024,
    c = new Float32Array(n),
    steps = 2 ** bits;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.round(x * steps) / steps;
  }
  return c;
}
function reverbImpulse(ctx: BaseAudioContext, dur = 1.1, decay = 2.5): AudioBuffer {
  const rate = ctx.sampleRate,
    len = Math.floor(rate * dur),
    buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** decay;
  }
  return buf;
}

// Module-cached curves (pure, ctx-independent). Impulse is per-ctx; the game
// has one ctx. Cast to the ArrayBuffer-backed variant WaveShaper.curve wants
// (the runtime buffer is a plain ArrayBuffer).
const DRIVE = driveCurve() as Float32Array<ArrayBuffer>,
  CRUSH = crushCurve() as Float32Array<ArrayBuffer>;
let impulseCache: { ctx: BaseAudioContext; buf: AudioBuffer } | null = null;

export function makeEffectNodes(ctx: AudioContext, id: EffectId): EffectNodes {
  const g = (v: number): GainNode => {
    const n = ctx.createGain();
    n.gain.value = v;
    return n;
  };
  switch (id) {
    case 'drive': {
      const pre = g(1),
        sh = ctx.createWaveShaper(),
        post = g(0.6);
      sh.curve = DRIVE;
      sh.oversample = '2x';
      pre.connect(sh).connect(post);
      return { input: pre, output: post, nodes: [pre, sh, post] };
    }
    case 'crush': {
      const sh = ctx.createWaveShaper(),
        post = g(0.9);
      sh.curve = CRUSH;
      sh.connect(post);
      return { input: sh, output: post, nodes: [sh, post] };
    }
    case 'echo': {
      const inp = g(1),
        out = g(1),
        delay = ctx.createDelay(1.0),
        fb = g(0.35),
        wet = g(0.5);
      delay.delayTime.value = 0.18;
      inp.connect(out); // dry
      inp.connect(delay);
      delay.connect(fb);
      fb.connect(delay); // feedback (fb<1 => decays)
      delay.connect(wet);
      wet.connect(out);
      return { input: inp, output: out, nodes: [inp, out, delay, fb, wet] };
    }
    case 'bloom': {
      if (!impulseCache || impulseCache.ctx !== ctx) impulseCache = { ctx, buf: reverbImpulse(ctx) };
      const inp = g(1),
        out = g(1),
        conv = ctx.createConvolver(),
        wet = g(0.3);
      conv.buffer = impulseCache.buf;
      inp.connect(out); // dry
      inp.connect(conv);
      conv.connect(wet);
      wet.connect(out);
      return { input: inp, output: out, nodes: [inp, out, conv, wet] };
    }
    case 'weight': {
      const f = ctx.createBiquadFilter(),
        post = g(1.15);
      f.type = 'lowpass';
      f.frequency.value = 700;
      f.Q.value = 0.7;
      f.connect(post);
      return { input: f, output: post, nodes: [f, post] };
    }
    case 'split': {
      const inp = g(1),
        out = g(1),
        delay = ctx.createDelay(0.1),
        wet = g(0.4);
      const lfo = ctx.createOscillator(),
        lfoGain = g(0.006);
      delay.delayTime.value = 0.02;
      lfo.frequency.value = 0.8;
      lfo.connect(lfoGain);
      lfoGain.connect(delay.delayTime);
      lfo.start();
      inp.connect(out); // dry
      inp.connect(delay);
      delay.connect(wet);
      wet.connect(out);
      return { input: inp, output: out, nodes: [inp, out, delay, wet, lfo] };
    }
  }
}
