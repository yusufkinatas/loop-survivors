// The one answer to "which chart events fire at this phrase step". Shared by
// the music engine (real clock, makes sound) and the autoplay bot's virtual
// clock (no sound, no real time), so the two can never disagree about what a
// build fires (docs/tools/autoplay-bot.md, one source of truth).

import { STEPS_PER_BAR } from './scale';
import type { Chart, ChartEvent } from './charts';

export function chartEventsAtStep(chart: Chart, phraseStep: number): ChartEvent[] {
  const loopStep = phraseStep % (chart.bars * STEPS_PER_BAR);
  const out: ChartEvent[] = [];
  for (const ev of chart.events) if (ev.step === loopStep) out.push(ev);
  return out;
}
