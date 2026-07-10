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

// Live play can collect several gems in one render frame. Only one choice may
// be consumed before the pick screen pauses the world; surplus XP must surface
// as another choice on the following frame, never disappear behind the first.
const emittedLevels: number[] = [];
const progressionProbe = new RunWorld(
  { width: 1280, height: 800 },
  {
    onLevelUp: (level) => emittedLevels.push(level),
    onDeath: () => {},
    onVictory: () => {},
    onHit: () => {},
  },
  { scripted: false, fx: false, xpThresholdMul: 0.12, maxBuildLevel: 28 },
);
const player = progressionProbe.player;
type GemProbe = { gems: { x: number; y: number; xp: number }[] };
(progressionProbe as unknown as GemProbe).gems.push(
  { x: player.x, y: player.y, xp: 1 },
  { x: player.x, y: player.y, xp: 1 },
);
progressionProbe.update(1 / 60);
invariant(
  progressionProbe.level === 2 && emittedLevels.length === 1,
  'game tracks: a same-frame gem batch consumed more than one visible pick',
);
progressionProbe.update(1 / 60);
invariant(
  progressionProbe.level === 3 && emittedLevels.length === 2,
  'game tracks: surplus XP did not surface on the next frame',
);
