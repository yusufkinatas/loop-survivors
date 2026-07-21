// Afterhours is the complete live-game voice set. Every playable weapon is
// rendered here from oscillators and noise before the selected CC0 drum
// palette is layered on top. No playable role falls back to the older builtin
// rehearsal voices during a healthy load.

import { makeKit, noiseBuffer, offline, softClipCurve, type Kit, type Role } from '../kits';

const AFTERHOURS_ROLES = [
  'kick', 'snare', 'hat', 'bass', 'chord', 'lead', 'clap', 'arp', 'bell',
] as const satisfies readonly Role[];

const AFTERHOURS_VARIANTS: Readonly<Partial<Record<Role, readonly string[]>>> = {
  kick: ['hard'],
  snare: ['snare'],
  hat: ['closed', 'open'],
  bass: ['bass', 'fat'],
  chord: ['stab', 'pad'],
  lead: ['lead'],
  clap: ['clap'],
  arp: ['arp'],
  bell: ['bell'],
};

function rootOrDefault(rootHz: number): number {
  return Number.isFinite(rootHz) && rootHz > 20 ? rootHz : 220;
}

async function renderKick(): Promise<AudioBuffer> {
  const ctx = offline(0.48);
  const body = ctx.createOscillator();
  body.type = 'sine';
  body.frequency.setValueAtTime(230, 0);
  body.frequency.exponentialRampToValueAtTime(54, 0.042);
  body.frequency.exponentialRampToValueAtTime(47, 0.28);
  const bodyGain = ctx.createGain();
  bodyGain.gain.setValueAtTime(0.96, 0);
  bodyGain.gain.exponentialRampToValueAtTime(0.001, 0.38);
  const drive = ctx.createWaveShaper();
  drive.curve = softClipCurve(2.25);
  body.connect(bodyGain).connect(drive).connect(ctx.destination);

  const beater = ctx.createBufferSource();
  beater.buffer = noiseBuffer(ctx, 0.014);
  const high = ctx.createBiquadFilter();
  high.type = 'highpass';
  high.frequency.value = 2_800;
  const beaterGain = ctx.createGain();
  beaterGain.gain.setValueAtTime(0.28, 0);
  beaterGain.gain.exponentialRampToValueAtTime(0.001, 0.014);
  beater.connect(high).connect(beaterGain).connect(ctx.destination);
  body.start(0);
  body.stop(0.44);
  beater.start(0);
  return ctx.startRendering();
}

async function renderSnare(): Promise<AudioBuffer> {
  const ctx = offline(0.34);
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer(ctx, 0.31);
  const high = ctx.createBiquadFilter();
  high.type = 'highpass';
  high.frequency.value = 760;
  const peak = ctx.createBiquadFilter();
  peak.type = 'peaking';
  peak.frequency.value = 2_050;
  peak.Q.value = 0.8;
  peak.gain.value = 6;
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.7, 0);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, 0.27);
  noise.connect(high).connect(peak).connect(noiseGain).connect(ctx.destination);

  const body = ctx.createOscillator();
  body.type = 'triangle';
  body.frequency.setValueAtTime(185, 0);
  body.frequency.exponentialRampToValueAtTime(112, 0.09);
  const bodyGain = ctx.createGain();
  bodyGain.gain.setValueAtTime(0.34, 0);
  bodyGain.gain.exponentialRampToValueAtTime(0.001, 0.16);
  body.connect(bodyGain).connect(ctx.destination);
  noise.start(0);
  body.start(0);
  body.stop(0.2);
  return ctx.startRendering();
}

async function renderClap(): Promise<AudioBuffer> {
  const ctx = offline(0.38);
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 1_420;
  band.Q.value = 0.72;
  const high = ctx.createBiquadFilter();
  high.type = 'highpass';
  high.frequency.value = 720;
  band.connect(high).connect(ctx.destination);
  for (const [at, gain, duration] of [
    [0, 0.5, 0.015], [0.011, 0.58, 0.016], [0.025, 0.48, 0.016], [0.043, 0.52, 0.24],
  ] as const) {
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer(ctx, duration);
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(gain, at);
    envelope.gain.exponentialRampToValueAtTime(0.001, at + duration);
    source.connect(envelope).connect(band);
    source.start(at);
  }
  return ctx.startRendering();
}

async function renderHat(open: boolean): Promise<AudioBuffer> {
  const duration = open ? 0.42 : 0.075;
  const ctx = offline(duration + 0.035);
  const high = ctx.createBiquadFilter();
  high.type = 'highpass';
  high.frequency.value = open ? 6_700 : 7_800;
  const envelope = ctx.createGain();
  envelope.gain.setValueAtTime(open ? 0.27 : 0.34, 0);
  envelope.gain.exponentialRampToValueAtTime(0.001, duration);
  high.connect(envelope).connect(ctx.destination);
  for (const multiplier of [1, 1.37, 1.91, 2.62, 3.49, 4.73]) {
    const metal = ctx.createOscillator();
    metal.type = 'square';
    metal.frequency.value = 390 * multiplier;
    const level = ctx.createGain();
    level.gain.value = 0.045;
    metal.connect(level).connect(high);
    metal.start(0);
    metal.stop(duration);
  }
  const air = ctx.createBufferSource();
  air.buffer = noiseBuffer(ctx, duration);
  const airGain = ctx.createGain();
  airGain.gain.value = 0.42;
  air.connect(airGain).connect(high);
  air.start(0);
  return ctx.startRendering();
}

async function renderBass(rootHz: number, fat: boolean): Promise<AudioBuffer> {
  const root = rootOrDefault(rootHz) / 4;
  const ctx = offline(fat ? 0.56 : 0.46);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(fat ? 1_750 : 1_250, 0);
  filter.frequency.exponentialRampToValueAtTime(fat ? 155 : 125, fat ? 0.38 : 0.3);
  filter.Q.value = fat ? 5.2 : 3.6;
  const drive = ctx.createWaveShaper();
  drive.curve = softClipCurve(fat ? 3.2 : 1.8);
  const envelope = ctx.createGain();
  envelope.gain.setValueAtTime(0.001, 0);
  envelope.gain.exponentialRampToValueAtTime(fat ? 0.62 : 0.55, 0.008);
  envelope.gain.exponentialRampToValueAtTime(0.001, fat ? 0.45 : 0.35);
  filter.connect(drive).connect(envelope).connect(ctx.destination);

  const sub = ctx.createOscillator();
  sub.type = 'sine';
  sub.frequency.value = root;
  const subGain = ctx.createGain();
  subGain.gain.value = 0.7;
  sub.connect(subGain).connect(envelope);
  const body = ctx.createOscillator();
  body.type = fat ? 'square' : 'triangle';
  body.frequency.value = root;
  body.detune.value = fat ? 7 : -3;
  const bodyGain = ctx.createGain();
  bodyGain.gain.value = fat ? 0.46 : 0.38;
  body.connect(bodyGain).connect(filter);
  sub.start(0);
  body.start(0);
  sub.stop(fat ? 0.5 : 0.4);
  body.stop(fat ? 0.5 : 0.4);
  return ctx.startRendering();
}

async function renderChord(rootHz: number, pad: boolean): Promise<AudioBuffer> {
  const root = rootOrDefault(rootHz);
  const duration = pad ? 1.55 : 0.5;
  const ctx = offline(duration + 0.08);
  const low = ctx.createBiquadFilter();
  low.type = 'lowpass';
  low.frequency.setValueAtTime(pad ? 2_200 : 4_600, 0);
  low.frequency.exponentialRampToValueAtTime(pad ? 850 : 1_250, duration * 0.82);
  const high = ctx.createBiquadFilter();
  high.type = 'highpass';
  high.frequency.value = 210;
  const envelope = ctx.createGain();
  envelope.gain.setValueAtTime(0.001, 0);
  envelope.gain.exponentialRampToValueAtTime(pad ? 0.25 : 0.31, pad ? 0.14 : 0.006);
  envelope.gain.exponentialRampToValueAtTime(0.001, duration);
  low.connect(high).connect(envelope).connect(ctx.destination);
  // Root, a wide middle note, and a bright upper note make one compact hit.
  for (const semitones of [0, 7, 15]) {
    for (const detune of [-7, 7]) {
      const oscillator = ctx.createOscillator();
      oscillator.type = detune < 0 ? 'triangle' : 'sawtooth';
      oscillator.frequency.value = root * 2 ** (semitones / 12);
      oscillator.detune.value = detune;
      const level = ctx.createGain();
      level.gain.value = pad ? 0.1 : 0.12;
      oscillator.connect(level).connect(low);
      oscillator.start(0);
      oscillator.stop(duration);
    }
  }
  return ctx.startRendering();
}

async function renderLead(rootHz: number): Promise<AudioBuffer> {
  const root = rootOrDefault(rootHz) * 2;
  const ctx = offline(0.62);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(5_800, 0);
  filter.frequency.exponentialRampToValueAtTime(1_100, 0.48);
  filter.Q.value = 2.4;
  const drive = ctx.createWaveShaper();
  drive.curve = softClipCurve(1.65);
  const envelope = ctx.createGain();
  envelope.gain.setValueAtTime(0.001, 0);
  envelope.gain.exponentialRampToValueAtTime(0.32, 0.009);
  envelope.gain.exponentialRampToValueAtTime(0.001, 0.54);
  filter.connect(drive).connect(envelope).connect(ctx.destination);
  for (const [type, detune, gain] of [
    ['square', -6, 0.34], ['sawtooth', 8, 0.23], ['triangle', -1_200, 0.16],
  ] as const) {
    const oscillator = ctx.createOscillator();
    oscillator.type = type;
    oscillator.frequency.value = root;
    oscillator.detune.value = detune;
    const level = ctx.createGain();
    level.gain.value = gain;
    oscillator.connect(level).connect(filter);
    oscillator.start(0);
    oscillator.stop(0.58);
  }
  return ctx.startRendering();
}

async function renderArp(rootHz: number): Promise<AudioBuffer> {
  const root = rootOrDefault(rootHz) * 2;
  const ctx = offline(0.43);
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(4_800, 0);
  filter.frequency.exponentialRampToValueAtTime(1_500, 0.28);
  // A wide band, not a sliver: at Q 1.25 the note was a thin slice sitting in
  // the hi-hats' own range, so it masked instead of reading as a line.
  filter.Q.value = 0.9;
  const envelope = ctx.createGain();
  envelope.gain.setValueAtTime(0.001, 0);
  envelope.gain.exponentialRampToValueAtTime(0.34, 0.004);
  envelope.gain.exponentialRampToValueAtTime(0.001, 0.31);
  filter.connect(envelope).connect(ctx.destination);
  for (const [type, detune, gain] of [
    ['square', -5, 0.24], ['triangle', 6, 0.34],
  ] as const) {
    const oscillator = ctx.createOscillator();
    oscillator.type = type;
    oscillator.frequency.value = root;
    oscillator.detune.value = detune;
    const level = ctx.createGain();
    level.gain.value = gain;
    oscillator.connect(level).connect(filter);
    oscillator.start(0);
    oscillator.stop(0.36);
  }
  return ctx.startRendering();
}

async function renderBell(rootHz: number): Promise<AudioBuffer> {
  const root = rootOrDefault(rootHz) * 2;
  const ctx = offline(1.05);
  const high = ctx.createBiquadFilter();
  high.type = 'highpass';
  high.frequency.value = 320;
  high.connect(ctx.destination);
  for (const [multiple, gain, decay] of [
    [1, 0.31, 0.88], [2.01, 0.18, 0.7], [2.72, 0.13, 0.52],
    [4.15, 0.075, 0.39], [5.43, 0.045, 0.28],
  ] as const) {
    const oscillator = ctx.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.value = root * multiple;
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0.001, 0);
    envelope.gain.exponentialRampToValueAtTime(gain, 0.003);
    envelope.gain.exponentialRampToValueAtTime(0.001, decay);
    oscillator.connect(envelope).connect(high);
    oscillator.start(0);
    oscillator.stop(decay + 0.03);
  }
  const strike = ctx.createBufferSource();
  strike.buffer = noiseBuffer(ctx, 0.018);
  const strikeHigh = ctx.createBiquadFilter();
  strikeHigh.type = 'highpass';
  strikeHigh.frequency.value = 5_400;
  const strikeGain = ctx.createGain();
  strikeGain.gain.setValueAtTime(0.1, 0);
  strikeGain.gain.exponentialRampToValueAtTime(0.001, 0.018);
  strike.connect(strikeHigh).connect(strikeGain).connect(ctx.destination);
  strike.start(0);
  return ctx.startRendering();
}

function validateCompleteKit(kits: ReadonlyMap<Role, Kit>): void {
  if (kits.size !== AFTERHOURS_ROLES.length) {
    throw new Error(`Afterhours kit has ${kits.size} roles, expected ${AFTERHOURS_ROLES.length}`);
  }
  for (const role of AFTERHOURS_ROLES) {
    const kit = kits.get(role);
    if (!kit) throw new Error(`Afterhours kit is missing ${role}`);
    for (const variant of AFTERHOURS_VARIANTS[role] ?? []) {
      if (!kit.samples.has(variant)) throw new Error(`Afterhours ${role} is missing ${variant}`);
    }
  }
}

export async function buildAfterhoursKit(rootHz: number): Promise<Map<Role, Kit>> {
  const [kick, snare, clap, closed, open, bass, fat, stab, pad, lead, arp, bell] = await Promise.all([
    renderKick(),
    renderSnare(),
    renderClap(),
    renderHat(false),
    renderHat(true),
    renderBass(rootHz, false),
    renderBass(rootHz, true),
    renderChord(rootHz, false),
    renderChord(rootHz, true),
    renderLead(rootHz),
    renderArp(rootHz),
    renderBell(rootHz),
  ]);
  const kits = new Map<Role, Kit>([
    ['kick', makeKit('kick', new Map([['hard', kick]]))],
    ['snare', makeKit('snare', new Map([['snare', snare]]))],
    ['hat', makeKit('hat', new Map([['closed', closed], ['open', open]]))],
    ['bass', makeKit('bass', new Map([['bass', bass], ['fat', fat]]))],
    ['chord', makeKit('chord', new Map([['stab', stab], ['pad', pad]]))],
    ['lead', makeKit('lead', new Map([['lead', lead]]))],
    ['clap', makeKit('clap', new Map([['clap', clap]]))],
    ['arp', makeKit('arp', new Map([['arp', arp]]))],
    ['bell', makeKit('bell', new Map([['bell', bell]]))],
  ]);
  validateCompleteKit(kits);
  return kits;
}
