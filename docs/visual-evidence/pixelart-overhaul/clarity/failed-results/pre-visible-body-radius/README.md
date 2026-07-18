# Invalid pre-fix clarity run

Three independent reviewers completed the 40-frame player-location packet on
commit `aa4e747`. All three displayed `0/40`, despite consistently selecting
the visible orange player. The shared failure was traced to the answer key:
it used the simulation collision circle centered at the player's feet instead
of the visible sprite body required by the protocol.

The reported aggregates and geometry are preserved in `diagnostic.json`.
They are not counted as failed art reviews because the scorer did not implement
the specified visual-body rule. Commit `09387b2` changed capture metadata to an
enclosing circle around the production idle/walk opaque-body union, regenerated
all 80 lossless packet captures, and left the image content unchanged.

No missing per-sample values were reconstructed. Corrected formal runs live in
`../../results/` and are checked independently against the regenerated answer
key.
