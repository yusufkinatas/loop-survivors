// Static authoring checks for the development-only Experimentation room.
// Audio buffers still need a browser to render, but malformed charts should
// fail here instead of silently dropping notes in LabEngine.

import { TRACKS } from '../src/tracklab/tracks';
import type { LabTrack } from '../src/tracklab/tracks/types';

const STEPS_PER_BAR = 16;
const REQUIRED_STUDIES = [
  'one',
  'animals',
  'latch',
  'aroundtheworld',
  'showmelove',
  'pjanoo',
] as const;

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function validateTrack(track: LabTrack): void {
  const at = `track ${track.id || '<missing id>'}`;
  invariant(track.id.trim().length > 0, `${at}: id is required`);
  invariant(track.title.trim().length > 0, `${at}: title is required`);
  invariant(track.artist.trim().length > 0, `${at}: artist is required`);
  invariant(Number.isFinite(track.bpm) && track.bpm > 0, `${at}: bpm must be positive`);
  invariant(Number.isInteger(track.bars) && track.bars >= 1 && track.bars <= 16, `${at}: bars must be 1..16`);
  invariant(track.voices.length > 0, `${at}: needs at least one instrument lane`);
  invariant(track.sections.length > 0, `${at}: needs at least one section`);

  const voiceIds = new Set<string>();
  for (const voice of track.voices) {
    invariant(voice.id.trim().length > 0, `${at}: voice id is required`);
    invariant(!voiceIds.has(voice.id), `${at}: duplicate voice ${voice.id}`);
    invariant(voice.name.trim().length > 0, `${at}/${voice.id}: display name is required`);
    invariant(typeof voice.build === 'function', `${at}/${voice.id}: sample builder is required`);
    voiceIds.add(voice.id);
  }

  const sectionIds = new Set<string>();
  const usedVoices = new Set<string>();
  for (const section of track.sections) {
    invariant(section.id.trim().length > 0, `${at}: section id is required`);
    invariant(!sectionIds.has(section.id), `${at}: duplicate section ${section.id}`);
    invariant(section.name.trim().length > 0, `${at}/${section.id}: display name is required`);
    sectionIds.add(section.id);

    const charts = Object.entries(section.charts);
    invariant(charts.length > 0, `${at}/${section.id}: section has no charts`);
    invariant(charts.some(([, chart]) => chart.events.length > 0), `${at}/${section.id}: section has no hits`);
    for (const [voiceId, chart] of charts) {
      const chartAt = `${at}/${section.id}/${voiceId}`;
      invariant(voiceIds.has(voiceId), `${chartAt}: chart refers to an unknown voice`);
      invariant(Number.isInteger(chart.bars) && chart.bars >= 1 && chart.bars <= 16, `${chartAt}: bars must be 1..16`);
      invariant(track.bars % chart.bars === 0, `${chartAt}: chart length must divide the track phrase`);
      const stepCount = chart.bars * STEPS_PER_BAR;
      for (const event of chart.events) {
        invariant(Number.isInteger(event.step) && event.step >= 0 && event.step < stepCount, `${chartAt}: invalid step ${event.step}`);
        invariant(Number.isFinite(event.velocity) && event.velocity > 0 && event.velocity <= 1, `${chartAt}: invalid velocity ${event.velocity}`);
        invariant(event.note === undefined || Number.isFinite(event.note), `${chartAt}: note must be finite`);
        invariant(event.variant === undefined || event.variant.length > 0, `${chartAt}: variant cannot be empty`);
      }
      if (chart.events.length > 0) usedVoices.add(voiceId);
    }
  }

  for (const voiceId of voiceIds) {
    invariant(usedVoices.has(voiceId), `${at}/${voiceId}: instrument never fires in any section`);
  }
}

const trackIds = new Set<string>();
for (const track of TRACKS) {
  invariant(!trackIds.has(track.id), `registry: duplicate track id ${track.id}`);
  trackIds.add(track.id);
  validateTrack(track);
}
for (const id of REQUIRED_STUDIES) {
  invariant(trackIds.has(id), `registry: required study ${id} is missing`);
}

const sections = TRACKS.reduce((total, track) => total + track.sections.length, 0);
const voices = TRACKS.reduce((total, track) => total + track.voices.length, 0);
console.log(`Track Lab valid: ${TRACKS.length} tracks, ${sections} sections, ${voices} instrument lanes.`);
