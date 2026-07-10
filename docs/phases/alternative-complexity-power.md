# Alternative Progression: Arsenal, Complexity, Power

Branch: `codex/complexity-power-arsenal`. Developer-directed alternative,
July 10, 2026. This does not amend the locked overhaul spec on `main`; it is a
playable competing version intended for an ear/hands comparison.

## The three systems

- **Arsenal** is the set of permanently hired instruments. The eight typed
  band slots remain, one instrument per slot. The run starts with Kick only.
- **Complexity** is literal: an instrument allocated C16 schedules exactly 16
  sound-and-weapon triggers in every complete four-bar phrase. Each level after
  level 1 adds four Complexity to the run's global budget. The Mix board can
  freely redistribute the full budget; points may remain banked.
- **Power** changes each trigger's weapon stat block and the voice's fullness.
  It never changes trigger count. Each level adds one global Power, freely
  redistributed on the Mix board. Power has five levels; the fifth extends the
  old top stat block and adds a final damage bump. Audio uses a broad body boost
  with output trim, so “fuller” does not mean careless raw loudness.

Runtime patterns are generated from the existing authored House ladders. Each
role's available event positions are ranked by the first ladder in which they
appear; C takes the first C positions and sorts them back into time. Every
generated chart is four bars and is checked to contain exactly C events. This
keeps the authored groove skeleton while allowing literal trigger counts.

## Level and Arsenal economy

Every level grants both +4 Complexity and +1 Power, then opens the Mix board.
The player is never forced to choose one resource and create a dead-end build.

Arsenal capacity is based on lifetime Power earned, never current allocation:
1/2/3/4/5/6/7/8 instruments at lifetime Power 1/3/5/7/9/12/15/18. Reallocating
Power cannot relock a slot. When capacity rises, three instruments from empty
band slots audition; one is hired permanently, then joins the Mix board at
zero allocation.

Confirmed Mix changes enter atomically on the next four-bar phrase. This keeps
the displayed Complexity count true for every complete phrase. An instrument
with zero Complexity or zero Power is silent and inactive.

## Arrangement pressure

High Complexity is an arrangement peak, not a permanent best setting. Each
role's redline begins at 80% of its authored Complexity cap.

- The first two consecutive redline phrases are **Push**: +15% damage.
- From the third, the part is **Overplayed**: -30% damage and it sounds one
  Power step thinner. Trigger count stays unchanged.
- Playing below redline removes one strain per phrase. A fully silent Rest
  phrase removes two.
- Clicking an owned rack socket queues Rest/Play on the next phrase. After two
  Rest phrases (and at least two earlier active phrases), returning earns two
  **Re-entry** phrases: +20% damage and one audible Power step of fullness.
- Newly activated hires receive the same two-phrase **Debut** treatment.
  Re-entry overrides Push rather than stacking with it.

Rest keeps the instrument's C/P committed. It is therefore an arrangement and
combat timing decision, not a free refund or a rapidly toggled damage exploit.

## Gate

Engineering checks: exact-count invariant for every supported role and every
Complexity value; TypeScript; production build; short headless run batch; one
Chrome main-path smoke after implementation.

Developer gate: does reallocating the Mix create satisfying, audible changes;
does Power sound fuller without merely louder; and does rotating redlined parts
feel like arranging a track while the muted game remains strategically sound?
