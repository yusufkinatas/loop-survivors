// Evolved sound treatments are deliberately audio-owned. The game tells the
// engine only whether a Role is evolved; this module decides how that existing
// chart event is voiced without importing Gear or EvolutionId from game code.
// Every entry below describes buffers layered inside ONE audio/game trigger.

import type { Role } from './kits';

export interface AudioLayerPlan {
  /** Start after the chart event, still inside the same musical hit. */
  delayS: number;
  /** Gain relative to the event's velocity/humanization envelope. */
  gain: number;
  /** Playback-rate multiplier relative to the chart note. */
  rateMul: number;
  pan?: number;
  highpassHz?: number;
  lowpassHz?: number;
  /** Bound an otherwise long/slowed copy. Measured from this layer's start. */
  stopAfterS?: number;
}

export interface EvolvedAudioTreatment {
  mainGain: number;
  mainRateMul: number;
  mainRateFromMul?: number;
  mainRateSlideS?: number;
  mainHighpassHz?: number;
  mainLowpassHz?: number;
  mainStopAfterS?: number;
  layers: readonly AudioLayerPlan[];
}

const neutral = (): EvolvedAudioTreatment => ({
  mainGain: 1,
  mainRateMul: 1,
  layers: [],
});

/** Pure plan for one evolved chart event. Kept deterministic so structural
 * checks can prove event-specific rules without starting an AudioContext. */
export function evolvedAudioTreatment(
  role: Role,
  step: number,
  variant?: string,
): EvolvedAudioTreatment {
  if (role === 'kick') {
    const fourthBeat = step >= 0 && step % 16 === 12;
    return {
      mainGain: fourthBeat ? 1.05 : 1,
      mainRateMul: 0.97,
      layers: fourthBeat
        ? [
            { delayS: 0, gain: 0.2, rateMul: 0.78, lowpassHz: 720, stopAfterS: 0.28 },
            { delayS: 0.045, gain: 0.13, rateMul: 0.86, lowpassHz: 1050, stopAfterS: 0.22 },
          ]
        : [{ delayS: 0, gain: 0.14, rateMul: 0.82, lowpassHz: 760, stopAfterS: 0.24 }],
    };
  }

  if (role === 'snare') {
    return {
      mainGain: 1.08,
      mainRateMul: 1.025,
      mainHighpassHz: 520,
      mainStopAfterS: 0.14,
      layers: [
        { delayS: 0, gain: 0.2, rateMul: 1.055, highpassHz: 2400, stopAfterS: 0.085 },
      ],
    };
  }

  if (role === 'hat') {
    const open = variant === 'open';
    return {
      mainGain: open ? 1.08 : 1.04,
      mainRateMul: open ? 1.025 : 1.04,
      mainHighpassHz: open ? 7200 : 8400,
      layers: [
        {
          delayS: 0,
          gain: open ? 0.16 : 0.12,
          rateMul: open ? 1.09 : 1.14,
          highpassHz: 9800,
          stopAfterS: open ? 0.3 : 0.055,
        },
      ],
    };
  }

  if (role === 'arp') {
    return {
      mainGain: 1,
      mainRateMul: 1,
      layers: [{ delayS: 0, gain: 0.17, rateMul: 2, pan: 0.22 }],
    };
  }

  if (role === 'bass') {
    const finalEvent = step >= 0 && step % 32 === 31;
    return {
      mainGain: 1,
      mainRateMul: 1,
      layers: finalEvent
        ? [{ delayS: 0, gain: 0.3, rateMul: 0.5, lowpassHz: 420, stopAfterS: 0.34 }]
        : [],
    };
  }

  if (role === 'chord') {
    const held = variant === 'pad';
    return {
      mainGain: 0.98,
      mainRateMul: 1,
      layers: [
        { delayS: 0.025, gain: 0.16, rateMul: 0.996, pan: -0.7 },
        { delayS: 0.075, gain: 0.14, rateMul: 1.004, pan: 0.7 },
        { delayS: held ? 0.18 : 0.14, gain: held ? 0.1 : 0.12, rateMul: 1, pan: 0.25 },
      ],
    };
  }

  if (role === 'lead') {
    return {
      mainGain: 1.04,
      mainRateMul: 1,
      mainRateFromMul: 0.965,
      mainRateSlideS: 0.045,
      mainLowpassHz: 6200,
      layers: [{ delayS: 0.012, gain: 0.16, rateMul: 1.006, pan: 0.38 }],
    };
  }

  if (role === 'clap') {
    return {
      mainGain: 1,
      mainRateMul: 1,
      layers: [
        { delayS: 0.052, gain: 0.14, rateMul: 0.985, pan: -0.65, highpassHz: 900 },
        { delayS: 0.092, gain: 0.11, rateMul: 1.018, pan: 0.58, highpassHz: 1100 },
        { delayS: 0.14, gain: 0.08, rateMul: 1.006, pan: -0.15, highpassHz: 1300 },
      ],
    };
  }

  if (role === 'bell') {
    return {
      mainGain: 0.98,
      mainRateMul: 1,
      layers: [
        { delayS: 0.045, gain: 0.13, rateMul: 2, pan: -0.75, highpassHz: 1800 },
        { delayS: 0.09, gain: 0.1, rateMul: 1.5, pan: 0.7, highpassHz: 1500 },
        { delayS: 0.145, gain: 0.075, rateMul: 2.02, pan: -0.32, highpassHz: 2200 },
        { delayS: 0.22, gain: 0.055, rateMul: 1.01, pan: 0.45, highpassHz: 1200 },
      ],
    };
  }

  return neutral();
}
