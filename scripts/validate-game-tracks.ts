// Static reachability/coherence checks for the four playable candidate tracks.
// Browser verification still builds and decodes every kit; this catches data
// drift (wrong pool, duplicate slot, silent/identical tier, lost bar 8) in CI.

import { TIER_COUNT } from '../src/audio/charts';
import { GAME_TRACKS } from '../src/audio/gameTracks';
import { slotOf } from '../src/game/band';
import { RunWorld } from '../src/game/run';

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const expected = new Set(['showmelove', 'animals', 'pursuit', 'satisfaction']);
invariant(GAME_TRACKS.length === expected.size, 'game tracks: expected exactly four profiles');

for (const track of GAME_TRACKS) {
  invariant(expected.delete(track.id), `game tracks: unexpected or duplicate ${track.id}`);
  invariant(track.roles.includes(track.startRole), `${track.id}: starting role is outside catalog`);
  invariant(track.startRole === 'kick', `${track.id}: audition run must establish the kick first`);
  invariant(
    track.maxBuildLevel === track.roles.length * TIER_COUNT,
    `${track.id}: incorrect dynamic build cap`,
  );
  invariant(new Set(track.roles).size === track.roles.length, `${track.id}: duplicate role`);
  const slots = track.roles.map(slotOf);
  invariant(new Set(slots).size === slots.length, `${track.id}: two weapons compete for one slot`);
  invariant(track.phraseBars === 8, `${track.id}: bar-eight phrase was shortened`);
  invariant(
    track.xpCurve.length === track.maxBuildLevel - 1,
    `${track.id}: XP curve must cover every remaining weapon state`,
  );
  invariant(track.xpCurve[0] === 1, `${track.id}: first onboarding pick must cost 1 XP`);
  invariant(track.xpCurve[1] >= 3, `${track.id}: second pick is too close to the first`);
  invariant(track.levelGapS >= 10, `${track.id}: pick-screen burst guard is too short`);
  track.xpCurve.forEach((threshold, index) => {
    invariant(
      Number.isInteger(threshold) && threshold >= 1,
      `${track.id}: XP threshold ${index + 1} is not a positive integer`,
    );
    if (index > 0) {
      invariant(
        threshold >= track.xpCurve[index - 1],
        `${track.id}: XP curve falls at threshold ${index + 1}`,
      );
    }
  });

  let reachesBarEight = false;
  for (const weapon of track.weapons) {
    invariant(weapon.ladder.length === TIER_COUNT, `${track.id}/${weapon.role}: needs four tiers`);
    weapon.ladder.forEach((chart, index) => {
      invariant(chart.events.length > 0, `${track.id}/${weapon.role}/tier${index + 1}: silent`);
      if (index > 0) {
        invariant(
          JSON.stringify(chart.events) !== JSON.stringify(weapon.ladder[index - 1].events),
          `${track.id}/${weapon.role}: tiers ${index} and ${index + 1} are identical`,
        );
        const previous = weapon.ladder[index - 1];
        const previousOnsets = new Set(previous.events.map((event) => event.step)).size;
        const currentOnsets = new Set(chart.events.map((event) => event.step)).size;
        const previousTimbres = [...new Set(previous.events.map((event) => event.variant ?? 'default'))]
          .sort()
          .join('|');
        const currentTimbres = [...new Set(chart.events.map((event) => event.variant ?? 'default'))]
          .sort()
          .join('|');
        invariant(
          currentOnsets > previousOnsets || currentTimbres !== previousTimbres,
          `${track.id}/${weapon.role}: tier ${index + 1} only changes loudness`,
        );
      }
    });
    if (weapon.ladder[TIER_COUNT - 1].events.some((event) => event.step >= 7 * 16)) {
      reachesBarEight = true;
    }
  }
  invariant(reachesBarEight, `${track.id}: no Level-IV lane reaches bar 8`);
  console.log(
    `${track.title}: ${track.roles.length} weapons, cap ${track.maxBuildLevel}, ` +
      `${track.bpm} BPM, final ${track.finalSectionId}`,
  );
}

invariant(expected.size === 0, `game tracks: missing ${[...expected].join(', ')}`);

// A gem pile may fund several levels, but the player must get active combat
// time between overlays. Surplus stays banked through the gap and surfaces
// later instead of disappearing or reopening a pick on the next frame.
const emittedLevels: number[] = [];
const probeTrack = GAME_TRACKS[0];
const progressionProbe = new RunWorld(
  { width: 1280, height: 800 },
  {
    onLevelUp: (level) => emittedLevels.push(level),
    onDeath: () => {},
    onVictory: () => {},
    onHit: () => {},
  },
  {
    scripted: false,
    fx: false,
    xpCurve: probeTrack.xpCurve,
    minLevelGapS: probeTrack.levelGapS,
    maxBuildLevel: probeTrack.maxBuildLevel,
  },
);
const player = progressionProbe.player;
type GemProbe = { gems: { x: number; y: number; xp: number }[] };
(progressionProbe as unknown as GemProbe).gems.push(
  ...Array.from({ length: 8 }, () => ({ x: player.x, y: player.y, xp: 1 })),
);
progressionProbe.update(1 / 60);
invariant(
  progressionProbe.level === 2 && emittedLevels.length === 1,
  'game tracks: a same-frame gem batch consumed more than one visible pick',
);
invariant(progressionProbe.xp === 7, 'game tracks: first pick did not conserve surplus XP');
progressionProbe.update(1 / 60);
invariant(
  progressionProbe.level === 2 && emittedLevels.length === 1,
  'game tracks: banked XP reopened a pick on the next frame',
);
for (let frame = 0; frame < 6 * 60; frame++) progressionProbe.update(1 / 60);
invariant(
  progressionProbe.xpProgress() > 0.45 && progressionProbe.xpProgress() < 0.55,
  'game tracks: banked XP meter does not visibly fill through the pick-screen gap',
);
for (let frame = 0; frame < 7 * 60; frame++) progressionProbe.update(1 / 60);
invariant(
  progressionProbe.level === 3 && emittedLevels.length === 2,
  'game tracks: banked XP did not surface after the pick-screen gap',
);
invariant(progressionProbe.xp === 4, 'game tracks: delayed pick did not conserve banked XP');
