// Kit-prototype manifests. Each genre being auditioned declares one or more
// alternative sampled voicings ("prototypes") built from a downloaded sound
// pack, so the developer can A/B them in-game (the sandbox) and
// pick one — the same process House went through before it adopted "Tight Tech".
//
// A prototype is nothing more than a directory of corrected sample files under
// public/samples/<genre>/<variant-id>/ plus a description of which roles it
// covers. When a prototype variant is active, ONLY the roles it lists are
// sample-backed (loaded from that directory); every other role falls back to
// the genre's synthesized voice. The special 'original' variant (never listed
// here) is the currently-shipped kit and loads from public/samples/<genre>/.
//
// Each genre owns exactly ONE file, src/audio/kits/protos/<genre>.ts, exporting
// `manifest`. Sub-agents fill these in; nothing else in the registry changes.

import type { Role } from '../../kits';

/** role -> [internalVariant, fileBase]. Mirrors SAMPLE_OVERLAY in kits/index.ts:
 *  internalVariant is the kit's own sub-variant id charts reference (e.g. 'hard'
 *  / 'soft' for a kick, 'closed' / 'open' for a hat); fileBase is the .wav name
 *  (without extension) under the variant directory. */
export type SampleSpec = [internalVariant: string, fileBase: string];

export interface ProtoVariant {
  /** Directory id under public/samples/<genre>/. Keep short (e.g. 'A', 'B'). */
  id: string;
  /** Shown in the selector, e.g. "A · 909 Club". */
  name: string;
  /** One-line character note (optional). */
  desc?: string;
  /** Roles this prototype supplies as real samples. Everything else = synth. */
  overlay: Partial<Record<Role, SampleSpec[]>>;
  /** Semitone tune for PITCHED sampled roles (align the recorded root to the
   *  engine's A reference), e.g. { bass: -3 }. Omit for unpitched-only kits. */
  tune?: Partial<Record<Role, number>>;
}

export interface ProtoManifest {
  variants: ProtoVariant[];
}

export const EMPTY: ProtoManifest = { variants: [] };
