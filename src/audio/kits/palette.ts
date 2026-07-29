// The palette (#266): the twelve voices that widen the live band from eight to
// twenty. Afterhours (./afterhours.ts) still renders the original eight exactly
// as it did — untouched, so the base stays readable as the control that all
// five round-1 prototypes are measured against. This file is everything added
// on top.
//
// THE DESIGN BRIEF, in the designer's own words, is the acceptance test:
//
//   "As long as they all sound coherent and not really out of place with each
//    other, if they can potentially be in the same track somehow in the real
//    world, then I don't mind them being recorded or synthesized."
//
// So the target is one band with RANGE rather than one genre: instrument
// characters that could play a dance track, a disco track or a slow one, with
// the genre living in the patterns and the tempo instead of in the timbres.
// That is what The Gig (three songs, three genres) and The Circuit (venues with
// their own genres) need the palette to be able to do.
//
// WHY THESE ARE SYNTHESIZED. #266 left the method to the agent under the bar
// above. The engine plays a melody from ONE recording sped up and slowed down,
// so a recorded voice is safe only where nothing pitches it. Every voice here
// except `shaker`, `air` and `wind` is pitched and has to follow the run's
// notes, which rules a recording out for it. The realism that recordings would
// have bought is chased instead through the details that actually sell an
// acoustic voice: a noise transient in front of the tone (a pick, a finger, a
// beater), inharmonic partials that decay at different rates, and breath.
//
// NOT HERE, AND ON PURPOSE: risers and crashes. #266 ruled that a looping
// weapon can only be a sound whose meaning survives repetition. A riser means
// "something is about to change" — fire it every phrase while nothing changes
// and the ear stops hearing it as a signal within about three loops, at which
// point the sound is lying. Transitions belong to whatever owns sections and
// changes, which is a stack's job, not the base's.

import { makeKit, noiseBuffer, offline, softClipCurve, type Kit, type Role } from '../kits';

/** The roles this file voices. Checked against the rendered map at the end so a
 *  half-built palette is a load error rather than a silent weapon mid-run. */
const PALETTE_ROLES = [
  'sub', 'upright', 'drone', 'rhodes', 'organ', 'chank',
  'bell', 'flute', 'shaker', 'pad', 'air', 'wind',
] as const satisfies readonly Role[];

function rootOrDefault(rootHz: number): number {
  return Number.isFinite(rootHz) && rootHz > 20 ? rootHz : 220;
}

// ---------------------------------------------------------------------------
// Low anchor — the bottom of the sound.
//
// All three choke (ROLE_META), because two low notes ringing together is the
// one overlap that reliably becomes mud instead of two instruments.
// ---------------------------------------------------------------------------

/** Sub: deep and round, felt more than heard. The palette's answer to "lower
 *  than the bass" — where the existing bass is a punchy short note with a
 *  filter and drive on it, this is nearly a pure tone.
 *
 *  THE ATTACK IS DELIBERATELY SOFT. A sub with a click on the front fights the
 *  kick for the same 8 ms and both lose; ramping in over 12 ms puts this voice
 *  entirely underneath the kick's transient instead of across it. */
async function renderSub(rootHz: number): Promise<AudioBuffer> {
  const root = rootOrDefault(rootHz) / 4;
  const ctx = offline(0.86);
  const envelope = ctx.createGain();
  envelope.gain.setValueAtTime(0.0001, 0);
  envelope.gain.exponentialRampToValueAtTime(0.92, 0.012);
  envelope.gain.exponentialRampToValueAtTime(0.001, 0.78);
  // Gentle saturation only. It adds enough second harmonic for the note to
  // survive a laptop speaker, which cannot reproduce the fundamental at all,
  // without turning a round tone into a buzzy one.
  const drive = ctx.createWaveShaper();
  drive.curve = softClipCurve(1.35);
  envelope.connect(drive).connect(ctx.destination);

  const fundamental = ctx.createOscillator();
  fundamental.type = 'sine';
  fundamental.frequency.value = root;
  const fundamentalGain = ctx.createGain();
  fundamentalGain.gain.value = 0.85;
  fundamental.connect(fundamentalGain).connect(envelope);

  // A quiet octave up, decaying faster than the fundamental, so the note has a
  // definite pitch on small speakers and settles into pure weight on big ones.
  const octave = ctx.createOscillator();
  octave.type = 'sine';
  octave.frequency.value = root * 2;
  const octaveGain = ctx.createGain();
  octaveGain.gain.setValueAtTime(0.2, 0);
  octaveGain.gain.exponentialRampToValueAtTime(0.001, 0.22);
  octave.connect(octaveGain).connect(envelope);

  fundamental.start(0);
  octave.start(0);
  fundamental.stop(0.84);
  octave.stop(0.3);
  return ctx.startRendering();
}

/** Upright: a woody plucked acoustic bass, finger noise and all. This is the
 *  single biggest range lever in the low seat — a plucked wooden bass is what
 *  stops a track sounding like a machine.
 *
 *  THREE LAYERS, and all three are needed. The tone alone reads as a dull sine;
 *  what makes an ear hear "a string being pulled by a finger" is the noise
 *  transient in front of it and the wooden body thump underneath. */
async function renderUpright(rootHz: number): Promise<AudioBuffer> {
  const root = rootOrDefault(rootHz) / 4;
  const ctx = offline(0.72);

  // 1. The string. A triangle plus a slightly detuned saw beats gently against
  // itself, which is what a thick wound string actually does. The lowpass falls
  // fast: an upright is damped by the player's hand and loses its top almost
  // immediately.
  const damp = ctx.createBiquadFilter();
  damp.type = 'lowpass';
  damp.frequency.setValueAtTime(2_600, 0);
  damp.frequency.exponentialRampToValueAtTime(240, 0.26);
  damp.Q.value = 1.4;
  const stringGain = ctx.createGain();
  stringGain.gain.setValueAtTime(0.0001, 0);
  stringGain.gain.exponentialRampToValueAtTime(0.8, 0.006);
  stringGain.gain.exponentialRampToValueAtTime(0.001, 0.62);
  damp.connect(stringGain).connect(ctx.destination);
  for (const [type, detune, gain] of [
    ['triangle', 0, 0.62], ['sawtooth', -9, 0.2],
  ] as const) {
    const oscillator = ctx.createOscillator();
    oscillator.type = type;
    oscillator.frequency.value = root;
    oscillator.detune.value = detune;
    const level = ctx.createGain();
    level.gain.value = gain;
    oscillator.connect(level).connect(damp);
    oscillator.start(0);
    oscillator.stop(0.68);
  }

  // 2. The finger. A short midrange noise scrape across the winding — this is
  // the layer that reads as "played by a person" rather than "generated".
  const finger = ctx.createBufferSource();
  finger.buffer = noiseBuffer(ctx, 0.03);
  const scrape = ctx.createBiquadFilter();
  scrape.type = 'bandpass';
  scrape.frequency.value = 1_850;
  scrape.Q.value = 0.9;
  const fingerGain = ctx.createGain();
  fingerGain.gain.setValueAtTime(0.3, 0);
  fingerGain.gain.exponentialRampToValueAtTime(0.001, 0.03);
  finger.connect(scrape).connect(fingerGain).connect(ctx.destination);

  // 3. The body. A big hollow wooden box resonating, pitched well under the
  // note and gone in a fifth of a second.
  const body = ctx.createOscillator();
  body.type = 'sine';
  body.frequency.setValueAtTime(128, 0);
  body.frequency.exponentialRampToValueAtTime(78, 0.07);
  const bodyGain = ctx.createGain();
  bodyGain.gain.setValueAtTime(0.34, 0);
  bodyGain.gain.exponentialRampToValueAtTime(0.001, 0.2);
  body.connect(bodyGain).connect(ctx.destination);

  finger.start(0);
  body.start(0);
  body.stop(0.24);
  return ctx.startRendering();
}

/** Drone: one held low note that moves slowly. The low seat's sustained voice,
 *  and the reason the seat clears #266's two-attack rule at all.
 *
 *  It is quiet on purpose. A drone's job is to be underneath everything and
 *  noticed only when it stops — which is exactly what makes it something a
 *  player can choose to drop. */
async function renderDrone(rootHz: number): Promise<AudioBuffer> {
  const root = rootOrDefault(rootHz) / 4;
  const ctx = offline(2.6);
  // The slow filter sweep IS the movement. Without it a held saw pair is a
  // buzz; with it the note breathes over the two bars it covers.
  const shape = ctx.createBiquadFilter();
  shape.type = 'lowpass';
  shape.frequency.setValueAtTime(180, 0);
  shape.frequency.exponentialRampToValueAtTime(620, 1.15);
  shape.frequency.exponentialRampToValueAtTime(210, 2.4);
  shape.Q.value = 3.2;
  const envelope = ctx.createGain();
  envelope.gain.setValueAtTime(0.0001, 0);
  envelope.gain.exponentialRampToValueAtTime(0.4, 0.28);
  envelope.gain.setValueAtTime(0.4, 2.0);
  envelope.gain.exponentialRampToValueAtTime(0.001, 2.55);
  shape.connect(envelope).connect(ctx.destination);
  // Three saws a few cents apart drift in and out of phase with each other,
  // which is what keeps a held note from sounding frozen.
  for (const detune of [-11, 0, 13]) {
    const oscillator = ctx.createOscillator();
    oscillator.type = 'sawtooth';
    oscillator.frequency.value = root;
    oscillator.detune.value = detune;
    const level = ctx.createGain();
    level.gain.value = 0.3;
    oscillator.connect(level).connect(shape);
    oscillator.start(0);
    oscillator.stop(2.58);
  }
  const sub = ctx.createOscillator();
  sub.type = 'sine';
  sub.frequency.value = root;
  const subGain = ctx.createGain();
  subGain.gain.value = 0.42;
  sub.connect(subGain).connect(envelope);
  sub.start(0);
  sub.stop(2.58);
  return ctx.startRendering();
}

// ---------------------------------------------------------------------------
// Harmonic body — the middle.
// ---------------------------------------------------------------------------

/** Rhodes: warm bell-like electric keys. Two-operator FM, which is what a real
 *  Rhodes essentially is — a struck metal tine whose overtone content collapses
 *  as the note decays. Modulator depth falling fast is the whole trick: bright
 *  and bell-like on the attack, round and woody a moment later. */
async function renderRhodes(rootHz: number): Promise<AudioBuffer> {
  const root = rootOrDefault(rootHz);
  const ctx = offline(1.4);
  const warmth = ctx.createBiquadFilter();
  warmth.type = 'lowpass';
  warmth.frequency.setValueAtTime(4_200, 0);
  warmth.frequency.exponentialRampToValueAtTime(1_100, 0.9);
  const envelope = ctx.createGain();
  envelope.gain.setValueAtTime(0.0001, 0);
  envelope.gain.exponentialRampToValueAtTime(0.5, 0.005);
  envelope.gain.exponentialRampToValueAtTime(0.001, 1.25);
  warmth.connect(envelope).connect(ctx.destination);

  const carrier = ctx.createOscillator();
  carrier.type = 'sine';
  carrier.frequency.value = root;
  const modulator = ctx.createOscillator();
  modulator.type = 'sine';
  modulator.frequency.value = root * 2;
  const modDepth = ctx.createGain();
  modDepth.gain.setValueAtTime(root * 2.6, 0);
  modDepth.gain.exponentialRampToValueAtTime(root * 0.04, 0.28);
  modulator.connect(modDepth).connect(carrier.frequency);
  const carrierGain = ctx.createGain();
  carrierGain.gain.value = 0.72;
  carrier.connect(carrierGain).connect(warmth);

  // The tine's own knock: the physical sound of the hammer hitting metal,
  // under 20 ms and pitched high above the note.
  const tine = ctx.createOscillator();
  tine.type = 'sine';
  tine.frequency.value = root * 6.4;
  const tineGain = ctx.createGain();
  tineGain.gain.setValueAtTime(0.14, 0);
  tineGain.gain.exponentialRampToValueAtTime(0.001, 0.018);
  tine.connect(tineGain).connect(warmth);

  carrier.start(0);
  modulator.start(0);
  tine.start(0);
  carrier.stop(1.36);
  modulator.stop(1.36);
  tine.stop(0.03);
  return ctx.startRendering();
}

/** Organ: held, breathing, drawbar-style. Additive — a stack of pure tones at
 *  whole-number multiples of the note, which is literally how a tonewheel organ
 *  makes sound.
 *
 *  The key click on the front is not a flaw being modelled for period charm: an
 *  organ with no click has no attack at all and disappears into a pad. */
async function renderOrgan(rootHz: number): Promise<AudioBuffer> {
  const root = rootOrDefault(rootHz);
  const ctx = offline(1.3);
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 3_400;
  const envelope = ctx.createGain();
  envelope.gain.setValueAtTime(0.0001, 0);
  envelope.gain.exponentialRampToValueAtTime(0.34, 0.022);
  envelope.gain.setValueAtTime(0.34, 0.9);
  envelope.gain.exponentialRampToValueAtTime(0.001, 1.24);
  tone.connect(envelope).connect(ctx.destination);
  // Drawbar registration: fundamental, octave, twelfth, double octave, and a
  // quiet upper third for bite. Two of them are detuned a couple of cents so
  // the stack shimmers instead of sitting dead still.
  for (const [multiple, gain, detune] of [
    [1, 0.42, 0], [2, 0.26, 4], [3, 0.15, 0], [4, 0.11, -5], [6, 0.06, 0],
  ] as const) {
    const oscillator = ctx.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.value = root * multiple;
    oscillator.detune.value = detune;
    const level = ctx.createGain();
    level.gain.value = gain;
    oscillator.connect(level).connect(tone);
    oscillator.start(0);
    oscillator.stop(1.28);
  }
  const click = ctx.createBufferSource();
  click.buffer = noiseBuffer(ctx, 0.008);
  const clickBand = ctx.createBiquadFilter();
  clickBand.type = 'bandpass';
  clickBand.frequency.value = 2_600;
  clickBand.Q.value = 0.7;
  const clickGain = ctx.createGain();
  clickGain.gain.setValueAtTime(0.16, 0);
  clickGain.gain.exponentialRampToValueAtTime(0.001, 0.008);
  click.connect(clickBand).connect(clickGain).connect(ctx.destination);
  click.start(0);
  return ctx.startRendering();
}

/** Chank: a muted guitar strum — short, dry, percussive scratch. The harmonic
 *  seat's bright-transient voice, and its most genre-portable one: a muted
 *  chank is at home in disco, funk, house and rock without changing a thing.
 *
 *  It is nearly all midrange by design. Palm-muted strings have no low end and
 *  no sparkle; the sound is a band around 1-3 kHz and a pick noise on top. */
async function renderChank(rootHz: number): Promise<AudioBuffer> {
  const root = rootOrDefault(rootHz);
  const ctx = offline(0.3);
  const mute = ctx.createBiquadFilter();
  mute.type = 'bandpass';
  mute.frequency.setValueAtTime(1_700, 0);
  mute.frequency.exponentialRampToValueAtTime(900, 0.12);
  mute.Q.value = 1.05;
  const grit = ctx.createWaveShaper();
  grit.curve = softClipCurve(2.6);
  const envelope = ctx.createGain();
  envelope.gain.setValueAtTime(0.0001, 0);
  envelope.gain.exponentialRampToValueAtTime(0.62, 0.004);
  envelope.gain.exponentialRampToValueAtTime(0.001, 0.16);
  mute.connect(grit).connect(envelope).connect(ctx.destination);
  // Three strings of the chord, struck a couple of milliseconds apart the way a
  // downstroke actually crosses them. The stagger is what makes it a strum
  // rather than a stab.
  const strings: readonly [number, number][] = [[0, 0], [7, 0.0022], [12, 0.0041]];
  for (const [semitones, at] of strings) {
    for (const [type, detune] of [['sawtooth', -6], ['square', 7]] as const) {
      const oscillator = ctx.createOscillator();
      oscillator.type = type;
      oscillator.frequency.value = root * 2 ** (semitones / 12);
      oscillator.detune.value = detune;
      const level = ctx.createGain();
      level.gain.setValueAtTime(0, 0);
      level.gain.setValueAtTime(0.17, at);
      oscillator.connect(level).connect(mute);
      oscillator.start(0);
      oscillator.stop(0.2);
    }
  }
  // The pick crossing the strings.
  const pick = ctx.createBufferSource();
  pick.buffer = noiseBuffer(ctx, 0.012);
  const pickBand = ctx.createBiquadFilter();
  pickBand.type = 'highpass';
  pickBand.frequency.value = 2_400;
  const pickGain = ctx.createGain();
  pickGain.gain.setValueAtTime(0.26, 0);
  pickGain.gain.exponentialRampToValueAtTime(0.001, 0.012);
  pick.connect(pickBand).connect(pickGain).connect(ctx.destination);
  pick.start(0);
  return ctx.startRendering();
}

// ---------------------------------------------------------------------------
// Bright line — the top.
// ---------------------------------------------------------------------------

/** Bell: a bright metallic ping, music-box-ish.
 *
 *  THE PARTIALS ARE DELIBERATELY NOT WHOLE-NUMBER MULTIPLES. That is the entire
 *  difference between a bell and an organ: struck metal rings at ratios that do
 *  not line up, which is why a bell has a shimmering, slightly unplaceable
 *  pitch. The higher partials also decay faster, so the sound starts as a clang
 *  and settles into a pure tone. */
async function renderBell(rootHz: number): Promise<AudioBuffer> {
  const root = rootOrDefault(rootHz) * 2;
  const ctx = offline(1.6);
  const air = ctx.createBiquadFilter();
  air.type = 'highpass';
  air.frequency.value = 300;
  air.connect(ctx.destination);
  for (const [ratio, gain, decay] of [
    [1, 0.3, 1.35], [2.01, 0.18, 0.9], [3.03, 0.12, 0.55],
    [4.21, 0.08, 0.34], [5.43, 0.05, 0.2], [6.79, 0.035, 0.12],
  ] as const) {
    const oscillator = ctx.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.value = root * ratio;
    const level = ctx.createGain();
    level.gain.setValueAtTime(0.0001, 0);
    level.gain.exponentialRampToValueAtTime(gain, 0.003);
    level.gain.exponentialRampToValueAtTime(0.0001, decay);
    oscillator.connect(level).connect(air);
    oscillator.start(0);
    oscillator.stop(Math.min(1.58, decay + 0.05));
  }
  // The strike itself — metal being hit, before any of it starts ringing.
  const strike = ctx.createBufferSource();
  strike.buffer = noiseBuffer(ctx, 0.006);
  const strikeBand = ctx.createBiquadFilter();
  strikeBand.type = 'bandpass';
  strikeBand.frequency.value = 5_200;
  strikeBand.Q.value = 0.6;
  const strikeGain = ctx.createGain();
  strikeGain.gain.setValueAtTime(0.2, 0);
  strikeGain.gain.exponentialRampToValueAtTime(0.001, 0.006);
  strike.connect(strikeBand).connect(strikeGain).connect(ctx.destination);
  strike.start(0);
  return ctx.startRendering();
}

/** Flute: a breathy held note with air in it. The bright seat's sustained
 *  voice.
 *
 *  THE BREATH IS THE INSTRUMENT. A sine with a soft attack is a test tone; what
 *  makes an ear hear a flute is the layer of noise running alongside the pitch
 *  the whole way through, loudest at the start where the player's breath first
 *  hits the edge. */
async function renderFlute(rootHz: number): Promise<AudioBuffer> {
  const root = rootOrDefault(rootHz) * 2;
  const ctx = offline(1.05);
  const envelope = ctx.createGain();
  envelope.gain.setValueAtTime(0.0001, 0);
  envelope.gain.exponentialRampToValueAtTime(0.46, 0.055);
  envelope.gain.setValueAtTime(0.46, 0.62);
  envelope.gain.exponentialRampToValueAtTime(0.001, 1.0);
  envelope.connect(ctx.destination);

  // Nearly pure, with a whisper of the octave and twelfth. A flute is one of
  // the least harmonically rich instruments there is.
  for (const [multiple, gain, detune] of [
    [1, 0.5, 0], [2, 0.07, 6], [3, 0.025, -4],
  ] as const) {
    const oscillator = ctx.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.value = root * multiple;
    oscillator.detune.value = detune;
    const level = ctx.createGain();
    level.gain.value = gain;
    oscillator.connect(level).connect(envelope);
    oscillator.start(0);
    oscillator.stop(1.03);
  }

  const breath = ctx.createBufferSource();
  breath.buffer = noiseBuffer(ctx, 1.0);
  const breathBand = ctx.createBiquadFilter();
  breathBand.type = 'bandpass';
  breathBand.frequency.value = root * 2.2;
  breathBand.Q.value = 0.85;
  const breathGain = ctx.createGain();
  breathGain.gain.setValueAtTime(0.3, 0);
  breathGain.gain.exponentialRampToValueAtTime(0.05, 0.12);
  breathGain.gain.exponentialRampToValueAtTime(0.001, 0.95);
  breath.connect(breathBand).connect(breathGain).connect(envelope);
  breath.start(0);
  return ctx.startRendering();
}

// ---------------------------------------------------------------------------
// Percussion.
// ---------------------------------------------------------------------------

/** Shaker: handheld, loose, organic — the least machine-like thing in the
 *  palette, and the biggest single range lever in it. Hand percussion is what
 *  stops a track reading as programmed.
 *
 *  TWO GRAINS, NOT ONE. A real shaker is a mass of beads arriving over a few
 *  milliseconds rather than a single event; a lone noise burst reads as a
 *  digital tick, and the second offset grain is what turns it back into
 *  something being shaken. */
async function renderShaker(): Promise<AudioBuffer> {
  const ctx = offline(0.2);
  const body = ctx.createBiquadFilter();
  body.type = 'highpass';
  body.frequency.value = 4_800;
  const sparkle = ctx.createBiquadFilter();
  sparkle.type = 'peaking';
  sparkle.frequency.value = 8_600;
  sparkle.Q.value = 0.8;
  sparkle.gain.value = 5;
  body.connect(sparkle).connect(ctx.destination);
  for (const [at, gain, duration] of [
    [0, 0.34, 0.05], [0.006, 0.22, 0.085],
  ] as const) {
    const grains = ctx.createBufferSource();
    grains.buffer = noiseBuffer(ctx, duration);
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0.0001, at);
    envelope.gain.exponentialRampToValueAtTime(gain, at + 0.003);
    envelope.gain.exponentialRampToValueAtTime(0.001, at + duration);
    grains.connect(envelope).connect(body);
    grains.start(at);
  }
  return ctx.startRendering();
}

// ---------------------------------------------------------------------------
// Texture — the only seat that is not a hit.
//
// These are held sounds. They have no firing moment, which is why #266 made
// them the named exception to the grid's two-attack rule and why their weapons
// damage continuously rather than per trigger. All three choke: a held sound
// re-articulating on top of itself stacks tails forever.
// ---------------------------------------------------------------------------

/** Pad: a soft held chord, the warm cushion underneath everything. Wide, weak,
 *  and the most audible thing a player can choose to drop — which is exactly
 *  the going-thin move #253 built the whole standard around.
 *
 *  Quiet and slow on purpose. It is a cushion, not a chord: if it announces
 *  itself it has become the harmonic seat's job instead of this one's. */
async function renderPad(rootHz: number): Promise<AudioBuffer> {
  const root = rootOrDefault(rootHz);
  const ctx = offline(3.0);
  const soften = ctx.createBiquadFilter();
  soften.type = 'lowpass';
  soften.frequency.setValueAtTime(900, 0);
  soften.frequency.exponentialRampToValueAtTime(2_300, 1.3);
  soften.frequency.exponentialRampToValueAtTime(800, 2.85);
  soften.Q.value = 0.7;
  const body = ctx.createBiquadFilter();
  body.type = 'highpass';
  body.frequency.value = 190;
  const envelope = ctx.createGain();
  envelope.gain.setValueAtTime(0.0001, 0);
  envelope.gain.exponentialRampToValueAtTime(0.3, 0.42);
  envelope.gain.setValueAtTime(0.3, 2.3);
  envelope.gain.exponentialRampToValueAtTime(0.001, 2.95);
  soften.connect(body).connect(envelope).connect(ctx.destination);
  // Root, fifth and octave, each doubled and detuned. Slow beating between the
  // pairs is what makes a pad feel alive rather than static.
  for (const semitones of [0, 7, 12]) {
    for (const detune of [-9, 10]) {
      const oscillator = ctx.createOscillator();
      oscillator.type = detune < 0 ? 'sawtooth' : 'triangle';
      oscillator.frequency.value = root * 2 ** (semitones / 12);
      oscillator.detune.value = detune;
      const level = ctx.createGain();
      level.gain.value = 0.09;
      oscillator.connect(level).connect(soften);
      oscillator.start(0);
      oscillator.stop(2.98);
    }
  }
  return ctx.startRendering();
}

/** Air: vinyl hiss and crackle. Room, no notes.
 *
 *  Unpitched, and the only voice in the palette that is pure texture with no
 *  tone in it at all. The crackle is what makes it read as a record rather than
 *  as noise: irregular little pops scattered through a steady bed of hiss. */
async function renderAir(): Promise<AudioBuffer> {
  const ctx = offline(2.4);
  const hiss = ctx.createBufferSource();
  hiss.buffer = noiseBuffer(ctx, 2.35);
  const hissBand = ctx.createBiquadFilter();
  hissBand.type = 'bandpass';
  hissBand.frequency.value = 3_800;
  hissBand.Q.value = 0.45;
  const hissGain = ctx.createGain();
  hissGain.gain.setValueAtTime(0.0001, 0);
  hissGain.gain.exponentialRampToValueAtTime(0.2, 0.06);
  hissGain.gain.setValueAtTime(0.2, 1.9);
  hissGain.gain.exponentialRampToValueAtTime(0.001, 2.35);
  hiss.connect(hissBand).connect(hissGain).connect(ctx.destination);

  // The pops. Spaced by an irregular walk rather than evenly, because evenly
  // spaced crackle stops being crackle and becomes a rhythm.
  const pops = ctx.createBiquadFilter();
  pops.type = 'highpass';
  pops.frequency.value = 1_500;
  pops.connect(ctx.destination);
  for (let at = 0.03; at < 2.25; at += 0.035 + Math.random() * 0.16) {
    const pop = ctx.createBufferSource();
    pop.buffer = noiseBuffer(ctx, 0.004);
    const level = ctx.createGain();
    const loudness = 0.05 + Math.random() * 0.13;
    level.gain.setValueAtTime(loudness, at);
    level.gain.exponentialRampToValueAtTime(0.0005, at + 0.004);
    pop.connect(level).connect(pops);
    pop.start(at);
  }
  hiss.start(0);
  return ctx.startRendering();
}

/** Wind: a slow moving wash of air. The texture voice that is not an aura — its
 *  weapon lays a damaging wake along the ground behind the player, so it does
 *  nothing at all standing still and everything cutting lines through a crowd.
 *
 *  The sweep is the sound. A static filtered noise bed is air conditioning; a
 *  band that travels up and back down over two bars is weather. */
async function renderWind(): Promise<AudioBuffer> {
  const ctx = offline(2.4);
  const gust = ctx.createBufferSource();
  gust.buffer = noiseBuffer(ctx, 2.35);
  const sweep = ctx.createBiquadFilter();
  sweep.type = 'bandpass';
  sweep.frequency.setValueAtTime(320, 0);
  sweep.frequency.exponentialRampToValueAtTime(1_900, 1.2);
  sweep.frequency.exponentialRampToValueAtTime(420, 2.3);
  sweep.Q.value = 1.6;
  // A second, wider band underneath keeps the sweep from thinning out to a
  // whistle at the top of its travel.
  const bed = ctx.createBiquadFilter();
  bed.type = 'lowpass';
  bed.frequency.value = 2_600;
  const envelope = ctx.createGain();
  envelope.gain.setValueAtTime(0.0001, 0);
  envelope.gain.exponentialRampToValueAtTime(0.34, 0.35);
  envelope.gain.setValueAtTime(0.34, 1.5);
  envelope.gain.exponentialRampToValueAtTime(0.001, 2.35);
  gust.connect(sweep).connect(envelope).connect(ctx.destination);

  const under = ctx.createBufferSource();
  under.buffer = noiseBuffer(ctx, 2.35);
  const underGain = ctx.createGain();
  underGain.gain.value = 0.1;
  under.connect(bed).connect(underGain).connect(envelope);

  gust.start(0);
  under.start(0);
  return ctx.startRendering();
}

// ---------------------------------------------------------------------------

function validatePalette(kits: ReadonlyMap<Role, Kit>): void {
  for (const role of PALETTE_ROLES) {
    if (!kits.has(role)) throw new Error(`palette kit is missing ${role}`);
  }
  if (kits.size !== PALETTE_ROLES.length) {
    throw new Error(`palette kit has ${kits.size} roles, expected ${PALETTE_ROLES.length}`);
  }
}

/** Render the palette's twelve voices. Merged over the Afterhours eight by
 *  buildSoundsetKit; the two never overlap, so a change here cannot move the
 *  control's eight voices. */
export async function buildPaletteKit(rootHz: number): Promise<Map<Role, Kit>> {
  const [
    sub, upright, drone, rhodes, organ, chank, bell, flute, shaker, pad, air, wind,
  ] = await Promise.all([
    renderSub(rootHz),
    renderUpright(rootHz),
    renderDrone(rootHz),
    renderRhodes(rootHz),
    renderOrgan(rootHz),
    renderChank(rootHz),
    renderBell(rootHz),
    renderFlute(rootHz),
    renderShaker(),
    renderPad(rootHz),
    renderAir(),
    renderWind(),
  ]);
  const kits = new Map<Role, Kit>([
    ['sub', makeKit('sub', new Map([['sub', sub]]))],
    ['upright', makeKit('upright', new Map([['upright', upright]]))],
    ['drone', makeKit('drone', new Map([['drone', drone]]))],
    ['rhodes', makeKit('rhodes', new Map([['rhodes', rhodes]]))],
    ['organ', makeKit('organ', new Map([['organ', organ]]))],
    ['chank', makeKit('chank', new Map([['chank', chank]]))],
    ['bell', makeKit('bell', new Map([['bell', bell]]))],
    ['flute', makeKit('flute', new Map([['flute', flute]]))],
    ['shaker', makeKit('shaker', new Map([['shaker', shaker]]))],
    ['pad', makeKit('pad', new Map([['pad', pad]]))],
    ['air', makeKit('air', new Map([['air', air]]))],
    ['wind', makeKit('wind', new Map([['wind', wind]]))],
  ]);
  validatePalette(kits);
  return kits;
}
