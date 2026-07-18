# Invalid pre-export clarity run

Two independent reviewers completed the corrected player packet at 40/40, but
the review page exposed its per-sample result only through browser state that
the review tooling is intentionally unable to inspect. The displayed passes
are preserved in `diagnostic.json` but are not counted as formal evidence.

Commit `05c7396` publishes the same completed object as inert JSON text in the
DOM. An uncounted 40-sample smoke run verified that the export contains all
samples and the aggregate. Formal v3 runs repeat both packets and save that
exact DOM artifact; no per-sample values from the inaccessible runs were
invented or backfilled.
