import assert from 'node:assert/strict';
import { getChart } from '../src/audio/chartstore';
import { evolvedAudioTreatment } from '../src/audio/evolved';
import { supportedRoles } from '../src/audio/soundset';
import { EVOLUTION_BY_ROLE } from '../src/game/evolutions';

const roles = supportedRoles();
assert.equal(roles.length, 9, 'the live nine-weapon roster drifted');
assert.deepEqual(
  roles.filter((role) => EVOLUTION_BY_ROLE.has(role)),
  roles,
  'every live role must have one evolution treatment',
);

for (const role of roles) {
  const chart = getChart(role, 4);
  const eventCount = chart.events.length;
  const treatmentCount = chart.events.map((event) =>
    evolvedAudioTreatment(role, event.step, event.variant).layers.length,
  ).length;
  assert.equal(treatmentCount, eventCount, `${role}: treatment planning changed event count`);
  for (const event of chart.events) {
    const treatment = evolvedAudioTreatment(role, event.step, event.variant);
    assert(treatment.mainGain > 0, `${role}: main layer must remain audible`);
    assert(treatment.mainRateMul > 0, `${role}: invalid main playback rate`);
    for (const layer of treatment.layers) {
      assert(layer.delayS >= 0, `${role}: layer starts before its chart event`);
      assert(layer.gain > 0 && layer.gain <= 0.3, `${role}: evolved layer is not quiet`);
      assert(layer.rateMul > 0, `${role}: invalid evolved-layer playback rate`);
      if (layer.stopAfterS !== undefined) {
        assert(layer.stopAfterS > 0, `${role}: invalid layer lifetime`);
      }
    }
  }
}

assert.equal(evolvedAudioTreatment('kick', 0, 'hard').layers.length, 1);
assert.equal(evolvedAudioTreatment('kick', 12, 'hard').layers.length, 2, 'Dancefloor beat 4 must be heavier');
assert.equal(evolvedAudioTreatment('snare', 4).mainStopAfterS, 0.14, 'Dead Center tail drift');
assert.notDeepEqual(
  evolvedAudioTreatment('hat', 0, 'closed'),
  evolvedAudioTreatment('hat', 2, 'open'),
  'Needle Storm must distinguish closed and open Hat sounds',
);
assert.equal(evolvedAudioTreatment('arp', 0).layers[0]?.rateMul, 2, 'Orrery octave layer drift');
assert.equal(evolvedAudioTreatment('bass', 30, 'fat').layers.length, 0, 'Undertow normal events must stay short');
assert.equal(evolvedAudioTreatment('bass', 31, 'fat').layers[0]?.stopAfterS, 0.34, 'Undertow plunge must stay bounded');
assert.equal(evolvedAudioTreatment('chord', 0, 'pad').layers.length, 3, 'Cathedral width layers drift');
assert.equal(evolvedAudioTreatment('lead', 0).mainRateFromMul, 0.965, 'Headliner pitch slide drift');
assert.equal(evolvedAudioTreatment('clap', 4).layers.length, 3, 'Standing Ovation crowd layer drift');
assert.equal(evolvedAudioTreatment('bell', 2).layers.length, 4, 'Glass Choir reflections drift');

console.log('evolved audio Sub-phase B structure checks passed');
