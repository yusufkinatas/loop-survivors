// The one answer to "which chart events fire at this phrase step".

import { STEPS_PER_BAR } from './scale';
import type { Chart, ChartEvent } from './charts';

export function chartEventsAtStep(chart: Chart, phraseStep: number): ChartEvent[] {
  const loopStep = phraseStep % (chart.bars * STEPS_PER_BAR);
  const out: ChartEvent[] = [];
  for (const ev of chart.events) if (ev.step === loopStep) out.push(ev);
  return out;
}
