# Invalid pre-separation category run

The revised category presentation at commit `718ec3c` fixed the broad pickup
and effect layering failure, but Cedar's first complete independent run scored
36/40 (90%), below the required 38/40. All four misses were the enemy target,
and all four were classified as a friendly projectile across different vision
modes. The packet's completed 40/40 player passes are preserved here but are
not counted against the next revision.

Inspection of the committed metadata found that `enemy-128` and the real
friendly-projectile fixture were only about fifteen logical pixels apart. The
enemy's highlight therefore contained a second valid category, and later
enemy rows could also paint over the selected body.

Commit `3b82f73` moves the sampled enemy to `enemy-248`, promotes only that
requested real horde member above later enemy rows, and adds a verification
invariant requiring every target highlight to remain separated from all other
category targets. The regenerated packet is tied to that commit and must be
reviewed from scratch.
