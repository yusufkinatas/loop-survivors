// Static reachability/coherence checks for the four playable candidate tracks.
// Browser verification still builds and decodes every kit; this catches data
// drift (wrong pool, duplicate slot, silent/identical tier, lost bar 8) in CI.

import { TIER_COUNT } from '../src/audio/charts';
import { GAME_TRACKS } from '../src/audio/gameTracks';
import { slotOf, supportedSlots } from '../src/game/band';
import { RUN } from '../src/game/config';
import { RunWorld } from '../src/game/run';

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const expected = new Set(['showmelove', 'animals', 'pursuit', 'satisfaction']);
invariant(GAME_TRACKS.length === expected.size, 'game tracks: expected exactly four profiles');
invariant(
  RUN.xpCurve.length === supportedSlots().length * TIER_COUNT - 1,
  'game tracks: shared XP curve must cover the largest possible build',
);
invariant(
  [1, 11, 15, 16, 18].every((threshold, index) => RUN.xpCurve[index] === threshold),
  'game tracks: shared opening XP thresholds changed',
);
RUN.xpCurve.forEach((threshold, index) => {
  invariant(
    Number.isInteger(threshold) && threshold >= 1,
    `game tracks: shared XP threshold ${index + 1} is not a positive integer`,
  );
  if (index > 0) {
    invariant(
      threshold >= RUN.xpCurve[index - 1],
      `game tracks: shared XP curve falls at threshold ${index + 1}`,
    );
  }
});
for (let index = 6; index < RUN.xpCurve.length; index++) {
  const increment = RUN.xpCurve[index] - RUN.xpCurve[index - 1];
  const previousIncrement = RUN.xpCurve[index - 1] - RUN.xpCurve[index - 2];
  invariant(
    increment >= previousIncrement,
    `game tracks: post-opening XP growth shrinks at threshold ${index + 1}`,
  );
}

for (const track of GAME_TRACKS) {
  invariant(expected.delete(track.id), `game tracks: unexpected or duplicate ${track.id}`);
  invariant(!('xpCurve' in track), `${track.id}: track profiles must not own XP costs`);
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

// XP feedback is immediate: collecting a partial threshold changes the bar in
// that same simulation frame, and a full threshold levels in that same frame.
// A pile may fund several levels, but only one choice is emitted per frame so
// the live pick screen cannot hide choices behind one modal. Surplus is banked
// and the next full bar levels on the first resumed frame.
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
    maxBuildLevel: probeTrack.maxBuildLevel,
  },
);
const player = progressionProbe.player;
type GemProbe = { gems: { x: number; y: number; xp: number }[] };
const firstThreshold = RUN.xpCurve[0];
const secondThreshold = RUN.xpCurve[1];
const thirdThreshold = RUN.xpCurve[2];
(progressionProbe as unknown as GemProbe).gems.push(
  ...Array.from({ length: firstThreshold }, () => ({ x: player.x, y: player.y, xp: 1 })),
);
progressionProbe.update(1 / 60);
invariant(
  progressionProbe.level === 2 && progressionProbe.xp === 0 && emittedLevels.length === 1,
  'game tracks: a full gem pickup did not level immediately',
);
(progressionProbe as unknown as GemProbe).gems.push(
  ...Array.from({ length: secondThreshold - 1 }, () => ({
    x: player.x,
    y: player.y,
    xp: 1,
  })),
);
progressionProbe.update(1 / 60);
invariant(
  progressionProbe.level === 2 && progressionProbe.xp === secondThreshold - 1,
  'game tracks: partial gem pickup did not apply XP immediately',
);
invariant(
  Math.abs(progressionProbe.xpProgress() - (secondThreshold - 1) / secondThreshold) < 1e-9,
  'game tracks: XP bar does not reflect collected XP immediately',
);
(progressionProbe as unknown as GemProbe).gems.push(
  ...Array.from({ length: thirdThreshold + 3 }, () => ({
    x: player.x,
    y: player.y,
    xp: 1,
  })),
);
progressionProbe.update(1 / 60);
invariant(
  progressionProbe.level === 3 && emittedLevels.length === 2,
  'game tracks: a same-frame gem batch consumed more than one visible pick',
);
invariant(
  progressionProbe.xp === thirdThreshold + 2 && progressionProbe.xpProgress() === 1,
  'game tracks: pick did not conserve surplus XP in the full bar',
);
progressionProbe.update(1 / 60);
invariant(
  progressionProbe.level === 4 && emittedLevels.length === 3,
  'game tracks: a funded next level did not surface on the first resumed frame',
);
invariant(progressionProbe.xp === 2, 'game tracks: third pick did not conserve banked XP');
