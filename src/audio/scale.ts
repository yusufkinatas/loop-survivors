// The run's coherence skeleton (see docs/plan.md). One hardcoded skeleton for
// M1, structured as data so nothing downstream bakes it in.

/** Semitone offsets of the minor pentatonic scale from the root. */
export const MINOR_PENTATONIC = [0, 3, 5, 7, 10] as const;

export interface Skeleton {
  /** Beats per minute. A live variable: the scheduler reads it every step. */
  bpm: number;
  /** Root note as a frequency label only; samples are rendered at the root. */
  rootName: string;
  /** Root frequency in Hz at the octave each pitched kit treats as "0". */
  rootHz: number;
  /** Allowed semitone offsets from the root (any octave). */
  noteSet: readonly number[];
  beatsPerBar: number;
  stepsPerBeat: number;
}

export const SKELETON: Skeleton = {
  bpm: 110,
  rootName: 'A',
  rootHz: 220, // A3; kits render their sample relative to their own octave
  noteSet: MINOR_PENTATONIC,
  beatsPerBar: 4,
  stepsPerBeat: 4, // 16th-note grid
};

export const STEPS_PER_BAR = SKELETON.beatsPerBar * SKELETON.stepsPerBeat;

/** True if a semitone offset lands in the note set (any octave). */
export function inNoteSet(semitones: number): boolean {
  return SKELETON.noteSet.includes(((semitones % 12) + 12) % 12);
}

/** Playback-rate multiplier for a pitch shift in semitones. */
export function semitonesToRate(semitones: number): number {
  return Math.pow(2, semitones / 12);
}
