// Data shapes for Track Lab covers. A LabTrack is everything one cover
// needs: tempo, feel, its own instruments (built fresh, not the game's six
// kits), and charts grouped into switchable sections. Charts reuse the
// game's grid language: 16 steps per bar, velocity 0..1, semitone note
// offsets from each instrument's own root.

export interface LabChartEvent {
  step: number;
  velocity: number;
  variant?: string;
  /** Semitone offset from this instrument's rendered root. */
  note?: number;
}

export interface LabChart {
  bars: number;
  events: LabChartEvent[];
}

export interface LabVoiceDef {
  id: string;
  name: string;
  color: string;
  pitched: boolean;
  /** Monophonic: a new hit chokes the ringing one (long 808 tails). */
  choke?: boolean;
  /** Mix level baked by the track author; the UI volume multiplies it. */
  gain?: number;
  /** Routed through the sidechain pump bus (dips when a ducker hits). */
  ducked?: boolean;
  /** Hits from this voice drive the pump (the kick, usually). */
  ducker?: boolean;
  /** Note rows the grid displays for pitched voices, high to low. */
  noteRows?: number[];
  /** Semitones added to every hit: retunes a fetched sample's own pitch to
   *  the track's root (measured, like the game's sample sets). */
  tune?: number;
  defaultVariant?: string;
  /** Render or fetch every sample variant. Called once per track load. */
  build: (ctx: BaseAudioContext) => Promise<Map<string, AudioBuffer>>;
}

interface LabSection {
  id: string;
  name: string;
  /** voice id -> chart; a voice missing from a section is silent in it. */
  charts: Record<string, LabChart>;
}

export interface LabTrack {
  id: string;
  title: string;
  artist: string;
  genre: string;
  bpm: number;
  /** Loop length in bars; the lab phrase. Sections share it. */
  bars: number;
  /** 0 = straight machine timing; ~0.1-0.25 delays every off-16th. */
  swing?: number;
  /** Sidechain pump depth and recovery (the produced-mix glue). */
  pump?: { amount: number; release: number };
  humanizeGain?: number;
  humanizeCents?: number;
  /** Shown in the lab: what to listen for, what is approximated. */
  notes?: string;
  voices: LabVoiceDef[];
  sections: LabSection[];
}

const N = (bar: number, step: number) => bar * 16 + step;

/** Chart-authoring helper: rows of [bar, step, velocity, note?, variant?].
 *  Pass null for note on unpitched variant-only hits. */
export type HitRow = readonly [number, number, number, (number | null)?, string?];

export function hits(bars: number, rows: HitRow[]): LabChart {
  return {
    bars,
    events: rows.map((r) => {
      const ev: LabChartEvent = { step: N(r[0], r[1]), velocity: r[2] };
      if (r[3] !== undefined && r[3] !== null) ev.note = r[3];
      if (r[4] !== undefined) ev.variant = r[4];
      return ev;
    }),
  };
}
