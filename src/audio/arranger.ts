// The one answer to "which chart events fire at this phrase step". Shared by
// the music engine (real clock, makes sound) and the autoplay bot's virtual
// clock (no sound, no real time), so the two can never disagree about what a
// build fires (docs/tools/autoplay-bot.md, one source of truth).
//
// chartEventsAtStep is the identity read used by BOTH clocks. The section
// transforms below (Perform the Track v2) are called ONLY by the music engine,
// for the player's live sections — the bot never leaves GROOVE, so it never
// touches them and stays bit-identical (docs/phases/perform-the-track-v2.md).

import { STEPS_PER_BAR } from './scale';
import type { Chart, ChartEvent } from './charts';

export function chartEventsAtStep(chart: Chart, phraseStep: number): ChartEvent[] {
  const loopStep = phraseStep % (chart.bars * STEPS_PER_BAR);
  const out: ChartEvent[] = [];
  for (const ev of chart.events) if (ev.step === loopStep) out.push(ev);
  return out;
}

/** BREAK's "strip and thin" transform for a surviving voice: keep only the
 *  strong-beat hits so the pattern breathes. Drums keep beats 1 and 3 (every
 *  half-bar); pitched voices collapse to one held root per bar (note forced to
 *  0), which reads as the breakdown's long sustained low/pad. Pure: returns new
 *  event objects, never mutates the shared chart. */
export function stripEventsAtStep(
  chart: Chart,
  phraseStep: number,
  pitched: boolean,
): ChartEvent[] {
  const inBar = phraseStep % STEPS_PER_BAR;
  if (pitched) {
    if (inBar !== 0) return [];
    return chartEventsAtStep(chart, phraseStep).map((ev) => ({ ...ev, note: 0 }));
  }
  // Drums: keep only the half-bar strong beats (steps 0 and 8 within the bar).
  if (inBar % 8 !== 0) return [];
  return chartEventsAtStep(chart, phraseStep);
}

/** CLIMB's "dig the hole" thinning for the sub/bass voice: one hit per bar so
 *  the low end is present but sparse, leaving room for the drop to slam it back
 *  in. Pure. */
export function bassThinAtStep(chart: Chart, phraseStep: number): ChartEvent[] {
  if (phraseStep % STEPS_PER_BAR !== 0) return [];
  return chartEventsAtStep(chart, phraseStep);
}
