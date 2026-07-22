#!/usr/bin/env python3
"""Download the south rotation of each wave candidate into candidates/.

The agent writes candidates/wave<N>.json with the character ids and the
south-rotation URLs from get_character; this only fetches them, so the manifest
stays the single record of what was generated and at what parameters.

Run from the repo root:

    python3 art/pixellab/fetch-candidates.py 1
"""

import json
import subprocess
import sys
from pathlib import Path

CAND = Path(__file__).resolve().parents[1] / "pixellab" / "candidates"


def main() -> None:
    wave = sys.argv[1] if len(sys.argv) > 1 else "1"
    manifest = json.loads((CAND / f"wave{wave}.json").read_text())
    for enemy in manifest["enemies"]:
        for var in enemy["variations"]:
            dest = CAND / var["file"]
            # curl, not urllib: this machine's Python has no CA bundle wired up
            # and the asset host is HTTPS-only.
            subprocess.run(
                ["curl", "-sS", "--fail", "-o", str(dest), var["south_url"]],
                check=True,
            )
            print(f"{var['name']:>16} -> {dest.name}")


if __name__ == "__main__":
    main()
