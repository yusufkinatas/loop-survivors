# Invalid pre-layering category run

The formal category packet at commit `09387b2` failed its first independent
review. Cedar scored 17/40 (42.5%), while Birch stopped after the seventh
reveal because several highlight boxes overlapped the player or multiple
silhouettes. The valid player-identification passes from that packet are kept
alongside the failure, but they are not counted against the revised packet.

The failure exposed three presentation problems rather than a reviewer
vocabulary problem:

- pickups were drawn beneath opaque enemies in the MAX360 stress frame;
- the selected enemy was buried beside the player;
- the decorative-effect target was faint and visually indistinguishable from
  background combat noise.

Commit `718ec3c` moves pickups above enemies, selects a readable member of the
real MAX360 population, promotes only the requested decorative effect, and
uses target-centred native-resolution crops taken from the same deterministic
stress frame. All revised results must identify packet commit `718ec3c` and
are stored outside this failure directory.
